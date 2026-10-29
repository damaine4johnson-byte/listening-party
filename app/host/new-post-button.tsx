"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./new-post.module.css";

// Instagram-style "+" that lets an artist pick a photo or video from their device and share it to the feed.
export default function NewPostButton({ inline = false }: { inline?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [caption, setCaption] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function close() { setOpen(false); setFile(null); setCaption(""); setError(""); }

  async function share() {
    if (!file && !caption.trim()) { setError("Add a photo, video or caption."); return; }
    setPending(true); setError("");
    try {
      let mediaPath: string | null = null;
      if (file) {
        const ticket = await fetch("/api/host/feed/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: file.type, size: file.size }) });
        const t = await ticket.json().catch(() => ({}));
        if (!ticket.ok) throw new Error(t.error || "Could not start the upload.");
        const data = new FormData();
        data.append("cacheControl", "3600");
        data.append("", file);
        const up = await fetch(t.signedUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: data });
        if (!up.ok) throw new Error("Upload failed. Try again.");
        mediaPath = t.path;
      }
      const text = caption.trim();
      const response = await fetch("/api/host/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: (text.split("\n")[0] || "New post").slice(0, 120), body: text || "New post", mediaPath }),
      });
      const d = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(d.error || "Could not share.");
      close();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not share.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" className={inline ? styles.inline : styles.fab} aria-label="New post" onClick={() => setOpen(true)}>＋{inline && " New post"}</button>
      {open && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="New post" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className={styles.sheet}>
            <div className={styles.bar}>
              <button type="button" onClick={close} className={styles.link}>Cancel</button>
              <b>New post</b>
              <button type="button" onClick={() => void share()} disabled={pending} className={styles.share}>{pending ? "Sharing…" : "Share"}</button>
            </div>
            <label className={styles.pick}>
              {preview
                ? (file?.type.startsWith("video/")
                  ? <video src={preview} controls playsInline />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={preview} alt="Preview" />)
                : <span>📷<br />Choose a photo or video<br /><small>from your device</small></span>}
              <input type="file" hidden accept="image/*,video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={1500} rows={3} placeholder="Write a caption…" />
            {error && <p role="alert" className={styles.err}>{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
