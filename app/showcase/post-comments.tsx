"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import feed from "./feed.module.css";

type Comment = { id: string; author_name: string; body: string; created_at: string; mine: boolean };

export default function PostComments({ postId }: { postId: string }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function token() {
    return (await supabase?.auth.getSession())?.data.session?.access_token ?? "";
  }

  async function load() {
    const t = await token();
    const response = await fetch(`/api/feed/comments?post=${postId}`, { headers: t ? { Authorization: `Bearer ${t}` } : {}, cache: "no-store" });
    const d = await response.json().catch(() => ({ comments: [] }));
    setComments(d.comments ?? []); setSignedIn(Boolean(d.signedIn));
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && comments === null) await load();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(""); setPending(true);
    const response = await fetch("/api/feed/comments", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ post: postId, body: text }),
    });
    const d = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) { setError(d.error || "Could not post your comment."); return; }
    setComments((c) => [...(c ?? []), d.comment]); setText("");
  }

  async function remove(id: string) {
    await fetch("/api/feed/comments", { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ id }) });
    setComments((c) => (c ?? []).filter((x) => x.id !== id));
  }

  return (
    <div className={feed.comments}>
      <button type="button" className={feed.commentToggle} onClick={() => void toggle()}>
        💬 {open ? "Hide comments" : comments === null ? "Comments" : `Comments (${comments.length})`}
      </button>
      {open && (
        <div>
          {comments === null && <p className={feed.muted}>Loading…</p>}
          {comments?.length === 0 && <p className={feed.muted}>No comments yet.</p>}
          {comments?.map((c) => (
            <div key={c.id} className={feed.comment}>
              <strong>{c.author_name}</strong> <time className={feed.muted}>{new Date(c.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</time>
              <p>{c.body}</p>
              {c.mine && <button type="button" className={feed.commentToggle} onClick={() => void remove(c.id)}>Delete</button>}
            </div>
          ))}
          {signedIn ? (
            <form onSubmit={submit} className={feed.commentForm}>
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Add a comment…" required />
              <button type="submit" disabled={pending || !text.trim()}>Post</button>
            </form>
          ) : (
            <p className={feed.muted}><Link href="/signin">Sign in</Link> to comment.</p>
          )}
          {error && <p role="alert" className={feed.muted}>{error}</p>}
        </div>
      )}
    </div>
  );
}
