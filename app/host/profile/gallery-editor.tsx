"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./gallery.module.css";

type Photo = { id: string; caption: string; url: string };

const UPLOAD_URL = "/api/host/gallery";

export default function GalleryEditor() {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ file: File; preview: string } | null>(null);
  const [caption, setCaption] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch(UPLOAD_URL, { cache: "no-store" })
      .then(async (r) => setPhotos(r.ok ? (await r.json()).photos : []))
      .catch(() => setPhotos([]));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    if (!pending) return;
    const url = URL.createObjectURL(pending.file);
    setPending({ ...pending, preview: url });
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.file]);

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      setMessage("Gallery photos must be images (JPEG, PNG, WebP or GIF).");
      return;
    }
    setMessage("");
    setCaption("");
    setPending({ file, preview: "" });
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setMessage("");
    try {
      // Fetch the image and re-upload it through our own storage — works for
      // files picked from the device AND images saved from Instagram.
      const ticket = await fetch(UPLOAD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: pending.file.type || "image/jpeg", size: pending.file.size }),
      });
      const t = await ticket.json().catch(() => ({}));
      if (!ticket.ok) throw new Error(t.error || "Could not start the upload.");
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", pending.file);
      const up = await fetch(t.signedUrl, { method: "PUT", headers: { "x-upsert": "false" }, body });
      if (!up.ok) throw new Error("Upload failed. Try again.");
      const save = await fetch(UPLOAD_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: t.path, caption }),
      });
      const d = await save.json().catch(() => ({}));
      if (!save.ok) throw new Error(d.error || "Could not save the photo.");
      setPending(null);
      load();
      setMessage("Photo added to your gallery.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not add the photo.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this photo from your gallery?")) return;
    setBusy(true);
    try {
      const r = await fetch(UPLOAD_URL, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (r.ok) { setPhotos((p) => p?.filter((x) => x.id !== id) ?? null); setMessage("Photo removed."); }
      else setMessage("Could not remove the photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="gallery-title">
      <h2 id="gallery-title">Photo gallery</h2>
      <p className="small muted">
        Add photos from your device or pictures you saved from Instagram (open the post,
        save the image, then pick it below). Up to 24 photos, shown on your public profile.
      </p>

      {photos && photos.length > 0 && (
        <div className={styles.grid}>
          {photos.map((p) => (
            <div key={p.id} className={styles.tile}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.caption || "Gallery photo"} loading="lazy" />
              {p.caption && <span className={styles.cap}>{p.caption}</span>}
              <button type="button" className={styles.remove} disabled={busy} onClick={() => void remove(p.id)} aria-label="Remove photo">×</button>
            </div>
          ))}
        </div>
      )}
      {photos && photos.length === 0 && <p className="muted small">No photos yet.</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className={styles.hidden}
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
      />
      {!pending && (
        <button className="btn secondary" type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          + Add photo
        </button>
      )}

      {pending && (
        <div className={styles.confirm}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pending.preview} alt="Selected photo preview" />
          <div className="field">
            <label htmlFor="gallery-caption">Caption (optional)</label>
            <input id="gallery-caption" value={caption} maxLength={200} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn" type="button" disabled={busy} onClick={() => void confirm()}>{busy ? "Adding..." : "Add to gallery"}</button>
            <button className="btn secondary" type="button" disabled={busy} onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}

      {message && <p className="small" role="status">{message}</p>}
    </section>
  );
}
