"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Post = { id: string; title: string; body: string; created_at: string; mediaUrl: string | null; media_type: string | null };

// Artists post to the public Listening Room feed from here; listeners can comment on posts.
export default function HostFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/host/feed", { cache: "no-store" });
    const d = await response.json().catch(() => ({}));
    if (response.ok) setPosts(d.posts); else setNotice(d.error || "");
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true); setNotice("");
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
      const response = await fetch("/api/host/feed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body, mediaPath }) });
      const d = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(d.error || "Could not publish.");
      setTitle(""); setBody(""); setFile(null); form.reset();
      setNotice("Posted to the Listening Room feed.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not publish.");
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this post?")) return;
    await fetch("/api/host/feed", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await load();
  }

  return (
    <section className="panel" aria-labelledby="host-feed-title">
      <h2 id="host-feed-title">Post to the feed</h2>
      <p className="small">Share news or music with listeners. Admin posts are shown above artist posts, and listeners can comment on yours.</p>
      <form onSubmit={publish}>
        <div className="field"><label htmlFor="hf-title">Title</label>
          <input id="hf-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required /></div>
        <div className="field"><label htmlFor="hf-body">Post</label>
          <textarea id="hf-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1500} rows={3} required /></div>
        <div className="field"><label htmlFor="hf-file">Photo or video (optional, up to 50 MB)</label>
          <input id="hf-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <button className="btn" type="submit" disabled={pending}>{pending ? "Publishing..." : "Publish"}</button>
      </form>
      {notice && <p className="small" role="status">{notice}</p>}
      {posts.map((p) => (
        <div key={p.id} className="small" style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgb(255 255 255 / 12%)" }}>
          <strong>{p.title}</strong> · {new Date(p.created_at).toLocaleDateString()}
          <div>{p.body}</div>
          {p.mediaUrl && (p.media_type === "video"
            ? <video src={p.mediaUrl} controls preload="metadata" style={{ maxWidth: "100%", maxHeight: 200 }} />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={p.mediaUrl} alt="" style={{ maxWidth: "100%", maxHeight: 200 }} />)}
          <div><button className="btn secondary" type="button" onClick={() => void remove(p.id)}>Delete</button></div>
        </div>
      ))}
    </section>
  );
}
