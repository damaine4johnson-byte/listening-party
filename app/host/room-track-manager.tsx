"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { compressToMp3 } from "../../lib/compress-audio";

const COMPRESS_ABOVE_BYTES = 49 * 1024 * 1024;

type Track = { id: string; title: string; duration_seconds: number | null; track_order: number };
type UploadTrack = { key: string; file: File; title: string };

export default function RoomTrackManager({ roomId }: { roomId: string }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [uploadTracks, setUploadTracks] = useState<UploadTrack[]>([]);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  async function loadTracks() {
    try {
      const response = await fetch(`/api/host/rooms/tracks?roomId=${encodeURIComponent(roomId)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load playlist.");
      setTracks(result.tracks);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load playlist.");
    }
  }

  useEffect(() => { void loadTracks(); }, [roomId]);

  function chooseFiles(files: File[]) {
    setUploadTracks(files.map((file, index) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${index}`,
      file,
      title: file.name.replace(/\.[^.]+$/, ""),
    })));
  }

  async function addTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploadTracks.length === 0 || uploadTracks.some((track) => !track.title.trim()) || pending) return;
    if (!supabase) {
      setNotice("Supabase is not configured.");
      return;
    }

    setPending(true);
    let uploadedCount = 0;
    try {
      for (const [index, original] of uploadTracks.entries()) {
        let track = original;
        if (original.file.size > COMPRESS_ABOVE_BYTES) {
          const label = `track ${index + 1} of ${uploadTracks.length}: ${original.title}`;
          setNotice(`Compressing ${label} (large file, this can take a minute)...`);
          try {
            const file = await compressToMp3(original.file, (fraction) =>
              setNotice(`Compressing ${label} - ${Math.round(fraction * 100)}%`));
            track = { ...original, file };
          } catch {
            throw new Error(`Could not compress ${original.title}. Try exporting it as MP3 or FLAC under 50 MB.`);
          }
          if (track.file.size > COMPRESS_ABOVE_BYTES) throw new Error(`${original.title} is still over 50 MB after compression. Please trim or split it.`);
        }
        setNotice(`Uploading track ${index + 1} of ${uploadTracks.length}: ${track.title}`);
        const signedResponse = await fetch("/api/host/rooms/tracks/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId,
            fileName: track.file.name,
            contentType: track.file.type,
            fileSize: track.file.size,
          }),
        });
        const signedResult = await signedResponse.json();
        if (!signedResponse.ok) throw new Error(signedResult.error || "Could not prepare audio upload.");

        // Mobile browsers can report an empty file.type; Supabase rejects blank
        // content types, so fall back to a generic audio MIME.
        const { error: uploadError } = await supabase.storage
          .from("tracks")
          .uploadToSignedUrl(signedResult.path, signedResult.token, track.file, {
            contentType: track.file.type || "audio/mpeg",
          });
        if (uploadError) throw new Error(`Upload failed for ${track.title}. The file may exceed your Supabase plan's upload limit (50 MB on the free plan).`);

        const registerResponse = await fetch("/api/host/rooms/tracks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId, title: track.title.trim(), path: signedResult.path }),
        });
        const registerResult = await registerResponse.json();
        if (!registerResponse.ok) throw new Error(registerResult.error || `Could not add ${track.title} to the playlist.`);

        setTracks((current) => [...current, registerResult.track].sort((left, right) => left.track_order - right.track_order));
        setUploadTracks((current) => current.filter((item) => item.key !== track.key));
        uploadedCount += 1;
      }

      setNotice(`${uploadedCount} ${uploadedCount === 1 ? "track" : "tracks"} added. Playlist is ready for broadcast.`);
      const fileInput = document.getElementById(`track-files-${roomId}`) as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload playlist.";
      setNotice(uploadedCount > 0 ? `${uploadedCount} tracks saved. ${message}` : message);
    } finally {
      setPending(false);
    }
  }

  async function reorderTrack(index: number, offset: -1 | 1) {
    const nextIndex = index + offset;
    if (pending || nextIndex < 0 || nextIndex >= tracks.length) return;
    const reordered = [...tracks];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    setPending(true);
    try {
      const response = await fetch("/api/host/rooms/tracks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, trackIds: reordered.map((track) => track.id) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not reorder playlist.");
      setTracks(result.tracks);
      setNotice("Playlist order updated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not reorder playlist.");
    } finally {
      setPending(false);
    }
  }

  async function removeTrack(track: Track) {
    if (pending || !window.confirm(`Remove “${track.title}” from this room?`)) return;
    setPending(true);
    try {
      const response = await fetch("/api/host/rooms/tracks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, trackId: track.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not remove track.");
      setTracks((current) => current.filter((item) => item.id !== track.id));
      setNotice(`Removed ${track.title}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not remove track.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="field">
      <strong>Preload playlist · {tracks.length} tracks</strong>
      <p className="small">Add the full tracklist before starting playback in the room. Tracks play in upload order.</p>
      {tracks.map((track, index) => (
        <div className="row" key={track.id} style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
          <span className="small">{track.track_order + 1}. {track.title}</span>
          <div className="row">
            <button className="btn secondary" type="button" aria-label={`Move ${track.title} up`} disabled={pending || index === 0} onClick={() => void reorderTrack(index, -1)}>Up</button>
            <button className="btn secondary" type="button" aria-label={`Move ${track.title} down`} disabled={pending || index === tracks.length - 1} onClick={() => void reorderTrack(index, 1)}>Down</button>
            <button className="btn secondary" type="button" aria-label={`Remove ${track.title}`} disabled={pending} onClick={() => void removeTrack(track)}>Remove</button>
          </div>
        </div>
      ))}
      <form onSubmit={addTrack}>
        <div className="field">
          <label htmlFor={`track-files-${roomId}`}>Playlist audio files (WAV, MP3, FLAC and more; files over 50 MB are auto-compressed to MP3)</label>
          <input
            id={`track-files-${roomId}`}
            type="file"
            accept="audio/*"
            multiple
            disabled={pending}
            onChange={(event) => chooseFiles(Array.from(event.target.files ?? []))}
            required
          />
        </div>
        {uploadTracks.map((track, index) => (
          <div className="field" key={track.key}>
            <label htmlFor={`track-title-${roomId}-${index}`}>{index + 1}. {track.file.name}</label>
            <input
              id={`track-title-${roomId}-${index}`}
              value={track.title}
              onChange={(event) => setUploadTracks((current) => current.map((item) =>
                item.key === track.key ? { ...item, title: event.target.value } : item,
              ))}
              maxLength={120}
              required
              disabled={pending}
            />
          </div>
        ))}
        <button className="btn secondary" type="submit" disabled={pending || uploadTracks.length === 0}>
          {pending ? "Uploading playlist..." : `Upload ${uploadTracks.length || ""} ${uploadTracks.length === 1 ? "track" : "tracks"}`}
        </button>
      </form>
      {notice && <p className="small" role="status">{notice}</p>}
    </div>
  );
}