"use client";

import { useCallback, useEffect, useState } from "react";

type Analytics = {
  totals: {
    listeners: number; uniqueNames: number; hereNow: number; tipCents: number; tipCount: number;
    entryCents: number; entryCount: number; chatMessages: number; reactions: number;
  };
  daily: { date: string; joins: number }[];
  topTippers: { name: string; totalCents: number; count: number; avatar: string | null }[];
  topSongs: { title: string; totalCents: number; count: number }[];
  listeners: { name: string; avatar: string | null; joinedAt: string; here: boolean; tippedCents: number }[];
};

const money = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;

function Face({ name, src }: { name: string; src: string | null }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="hc-face" src={src} alt="" />
    : <span className="hc-face">{name.charAt(0).toUpperCase()}</span>;
}

export default function HostAnalytics({ rooms }: { rooms: { id: string; title: string }[] }) {
  const [roomId, setRoomId] = useState("");
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/host/analytics${roomId ? `?roomId=${encodeURIComponent(roomId)}` : ""}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load analytics.");
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => { void load(); }, [load]);

  const peak = Math.max(1, ...(data?.daily.map((day) => day.joins) ?? [1]));

  return (
    <section className="hc-analytics" aria-labelledby="analytics-title">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 id="analytics-title">Analytics</h2>
        <div className="row">
          <select aria-label="Room" value={roomId} onChange={(event) => setRoomId(event.target.value)}>
            <option value="">All rooms</option>
            {rooms.map((room) => <option key={room.id} value={room.id}>{room.title}</option>)}
          </select>
          <button className="btn secondary" type="button" onClick={() => void load()} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button>
        </div>
      </div>
      {error && <p className="small" role="alert">{error}</p>}
      {data && (
        <>
          <div className="hc-an-grid">
            <div className="hc-an-card"><b>{data.totals.listeners.toLocaleString()}</b><span>Listener joins</span></div>
            <div className="hc-an-card"><b>{data.totals.hereNow}</b><span>Here now</span></div>
            <div className="hc-an-card"><b>{money(data.totals.tipCents)}</b><span>{data.totals.tipCount} tips</span></div>
            <div className="hc-an-card"><b>{money(data.totals.entryCents)}</b><span>{data.totals.entryCount} paid entries</span></div>
            <div className="hc-an-card"><b>{data.totals.chatMessages.toLocaleString()}</b><span>Chat messages</span></div>
            <div className="hc-an-card"><b>{data.totals.reactions.toLocaleString()}</b><span>Reactions</span></div>
          </div>

          <h3>Joins · last 7 days</h3>
          <div className="hc-an-bars" role="img" aria-label="Listener joins per day for the last 7 days">
            {data.daily.map((day) => (
              <div key={day.date} className="hc-an-bar" title={`${day.date}: ${day.joins}`}>
                <span style={{ height: `${Math.max(4, (day.joins / peak) * 100)}%` }} />
                <small>{day.date.slice(5)}</small>
              </div>
            ))}
          </div>

          <div className="hc-an-cols">
            <div>
              <h3>Top tippers</h3>
              {data.topTippers.length === 0 ? <p className="muted small">No tips yet.</p> : (
                <ol className="hc-an-list">
                  {data.topTippers.map((tipper, index) => (
                    <li key={tipper.name}>
                      <span className="hc-rank">{index + 1}</span>
                      <Face name={tipper.name} src={tipper.avatar} />
                      <span className="hc-an-name">{tipper.name}</span>
                      <strong>{money(tipper.totalCents)}</strong>
                      <small>{tipper.count}×</small>
                    </li>
                  ))}
                </ol>
              )}
              <h3>Top tipped songs</h3>
              {data.topSongs.length === 0 ? <p className="muted small">No song tips yet.</p> : (
                <ol className="hc-an-list">
                  {data.topSongs.map((song, index) => (
                    <li key={`${song.title}-${index}`}>
                      <span className="hc-rank">{index + 1}</span>
                      <span className="hc-an-name">{song.title}</span>
                      <strong>{money(song.totalCents)}</strong>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <h3>Listeners <small>({data.listeners.length} most recent)</small></h3>
              {data.listeners.length === 0 ? <p className="muted small">Nobody has joined yet.</p> : (
                <ul className="hc-an-list hc-an-listeners">
                  {data.listeners.map((listener, index) => (
                    <li key={`${listener.name}-${listener.joinedAt}-${index}`}>
                      <Face name={listener.name} src={listener.avatar} />
                      <span className="hc-an-name">{listener.name}</span>
                      {listener.here && <span className="hc-dot" title="In the room now">● here</span>}
                      {listener.tippedCents > 0 && <strong>{money(listener.tippedCents)}</strong>}
                      <small>{new Date(listener.joinedAt).toLocaleDateString([], { month: "short", day: "numeric" })}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
