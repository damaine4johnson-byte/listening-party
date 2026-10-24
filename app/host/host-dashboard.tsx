"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type Room = {
  id: string;
  title: string;
  slug: string;
  status: "scheduled" | "live" | "ended";
  max_listeners: number;
  created_at: string;
};

export default function HostDashboard() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [title, setTitle] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [notice, setNotice] = useState("Loading rooms...");
  const [pending, setPending] = useState(false);

  async function loadRooms() {
    try {
      const response = await fetch("/api/host/rooms", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error || "Could not load rooms.");
        return;
      }
      setRooms(result.rooms);
      setNotice("");
    } catch {
      setNotice("Host service is unavailable. Try again shortly.");
    }
  }

  useEffect(() => {
    void loadRooms();
  }, []);

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setInviteCode("");
    setNotice("");

    try {
      const response = await fetch("/api/host/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error || "Could not create room.");
        return;
      }
      setRooms((current) => [result.room, ...current]);
      setInviteCode(result.inviteCode);
      setTitle("");
      setNotice("Room created. Copy and save this invite code; it will not be shown again.");
    } catch {
      setNotice("Room service is unavailable. Try again shortly.");
    } finally {
      setPending(false);
    }
  }

  async function logout() {
    await fetch("/api/host/session", { method: "DELETE" });
    window.location.reload();
  }

  async function copyInviteCode() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setNotice("Invite code copied.");
    } catch {
      setNotice("Copy failed. Select and copy the invite code manually.");
    }
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
        <span className="small">Signed in as host</span>
        <div className="row">
          <Link className="btn secondary" href="/host/profile">Profile setup</Link>
          <button className="btn secondary" type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </div>
      <section className="panel" aria-labelledby="create-room-title">
        <h2 id="create-room-title">Create a room</h2>
        <form onSubmit={createRoom}>
          <div className="field">
            <label htmlFor="room-title">Room title</label>
            <input
              id="room-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={100}
              required
            />
          </div>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Creating..." : "Create room"}
          </button>
        </form>
        {inviteCode && (
          <div className="field">
            <label htmlFor="new-invite-code">New invite code</label>
            <div className="row">
              <input id="new-invite-code" value={inviteCode} readOnly />
              <button className="btn secondary" type="button" onClick={() => void copyInviteCode()}>
                Copy code
              </button>
            </div>
          </div>
        )}
        {notice && <p role="status" className="small">{notice}</p>}
      </section>

      <section style={{ marginTop: 28 }} aria-labelledby="rooms-title">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 id="rooms-title">Rooms</h2>
          <button className="btn secondary" type="button" onClick={() => void loadRooms()}>
            Refresh
          </button>
        </div>
        {rooms.length === 0 ? (
          <p className="muted">No rooms yet.</p>
        ) : (
          <div className="panel">
            {rooms.map((room) => (
              <article key={room.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
                <strong>{room.title}</strong>
                <div className="small">{room.slug} · {room.status} · up to {room.max_listeners.toLocaleString()} listeners</div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}