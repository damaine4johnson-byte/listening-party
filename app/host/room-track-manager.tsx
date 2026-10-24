"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Track = { id: string; title: string; duration_seconds: number | null; track_order: number };

export default function RoomTrackManager({ roomId }: { roomId: string }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
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

  function chooseFile(selected: File | null) {
    setFile(selected);
    if (selected && !title.trim()) {
      setTitle(selected.name.replace(/\.[^.]+$/, ""));
    }
  }

  async function addTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !title.trim() || pending) return;
    if (!supabase) {
      setNotice("Supabase is not configured.");
      return;
    }

    setPending(true);
    setNotice("Preparing secure upload...");
    try {
      const signedResponse = await fetch("/api/host/rooms/tracks/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
        }),
      });
      const signedResult = await signedResponse.json();
      if (!signedResponse.ok) throw new Error(signedResult.error || "Could not prepare audio upload.");

      setNotice("Uploading audio...");
      const { error: uploadError } = await supabase.storage
        .from("tracks")
        .uploadToSignedUrl(signedResult.path, signedResult.token, file, { contentType: file.type });
      if (uploadError) throw new Error("Audio upload failed. Check the private tracks bucket size limit.");

      const registerResponse = await fetch("/api/host/rooms/tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, title: title.trim(), path: signedResult.path }),
      });
      const registerResult = await registerResponse.json();
      if (!registerResponse.ok) throw new Error(registerResult.error || "Could not add track to room.");

      setTracks((current) => [...current, registerResult.track].sort((left, right) => left.track_order - right.track_order));
      setTitle("");
      setFile(null);
      setNotice("Track added to playlist.");
      const fileInput = document.getElementById(`track-file-${roomId}`) as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not add track.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="field">
      <strong>Playlist · {tracks.length} tracks</strong>
      {tracks.map((track) => <div className="small" key={track.id}>{track.track_order + 1}. {track.title}</div>)}
      <form onSubmit={addTrack}>
        <div className="field">
          <label htmlFor={`track-title-${roomId}`}>Track title</label>
          <input
            id={`track-title-${roomId}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`track-file-${roomId}`}>Audio file (up to 40 MB)</label>
          <input
            id={`track-file-${roomId}`}
            type="file"
            accept="audio/*"
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            required
          />
        </div>
        <button className="btn secondary" type="submit" disabled={pending || !file}>
          {pending ? "Uploading..." : "Add track"}
        </button>
      </form>
      {notice && <p className="small" role="status">{notice}</p>}
    </div>
  );
}