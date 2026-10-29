"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";

type Notice = { id: string; title: string; body: string; room_code: string; link: string; paid: boolean; read_at: string | null; created_at: string };

// Listener notifications (new rooms from followed artists), shown next to the site menu.
export default function NotificationBell() {
  const [token, setToken] = useState("");
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? ""));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setToken(session?.access_token ?? ""));
    return () => data.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    const response = await fetch("/api/listeners/notifications", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) return;
    const d = await response.json();
    setItems(d.notifications); setUnread(d.unread);
  }, [token]);

  useEffect(() => {
    if (!token) { setItems([]); setUnread(0); return; }
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 45_000);
    return () => clearInterval(timer);
  }, [token, load]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await fetch("/api/listeners/notifications", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      setUnread(0);
    }
  }

  if (!token) return null;
  return (
    <div className="notif" ref={box}>
      <button type="button" aria-label={`Notifications${unread ? `, ${unread} new` : ""}`} aria-expanded={open} onClick={() => void toggle()}>
        🔔{unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          {items.length === 0 && <p className="notif-empty">No notifications yet. Follow artists to hear when they open a room.</p>}
          {items.map((n) => (
            <Link key={n.id} href={n.link || "/"} className={`notif-item${n.read_at ? "" : " new"}`} onClick={() => setOpen(false)}>
              <strong>{n.title}</strong>
              <span>{n.body}</span>
              <em>{n.paid ? "Tap to pay and enter →" : "Tap to enter now →"}</em>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
