"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

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
      for (const [index, track] of uploadTracks.entries()) {
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

        const { error: uploadError } = await supabase.storage
          .from("tracks")
          .uploadToSignedUrl(signedResult.path, signedResult.token, track.file, { contentType: track.file.type });
        if (uploadError) throw new Error(`Upload failed for ${track.title}. Check the private tracks bucket size limit.`);

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

  return (
    <div className="field">
      <strong>Preload playlist · {tracks.length} tracks</strong>
      <p className="small">Add the full tracklist before starting playback in the room. Tracks play in upload order.</p>
      {tracks.map((track) => <div className="small" key={track.id}>{track.track_order + 1}. {track.title}</div>)}
      <form onSubmit={addTrack}>
        <div className="field">
          <label htmlFor={`track-files-${roomId}`}>Playlist audio files (up to 40 MB each)</label>
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