"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import LogoMark from "../logo-mark";

type RoomState = {
  room_id: string;
  track_id: string | null;
  status: "playing" | "paused";
  position_seconds: number;
  started_at: string | null;
  updated_at: string;
};
type ChatMessage = { id: string; display_name: string; body: string; created_at: string };
type RoomTrack = { id: string; title: string; durationSeconds: number | null; trackOrder: number; url: string };
type HostProfile = { display_name: string; bio: string; avatar_url: string };
type Reaction = { id: string; display_name: string; reaction: "heart" | "fire" | "clap" | "laugh" | "wow"; created_at: string };
type HouseAd = { title: string; body: string; href: string };

const REACTIONS = [
  { id: "heart", label: "Love", symbol: "♥" },
  { id: "fire", label: "Fire", symbol: "🔥" },
  { id: "clap", label: "Clap", symbol: "👏" },
  { id: "laugh", label: "Laugh", symbol: "😂" },
  { id: "wow", label: "Wow", symbol: "😮" },
] as const;

function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export default function RoomClient({ displayName }: { displayName: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [tracks, setTracks] = useState<RoomTrack[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("Connecting to room...");
  const [isHost, setIsHost] = useState(false);
  const [roomTitle, setRoomTitle] = useState("Listening room");
  const [hostProfile, setHostProfile] = useState<HostProfile | null>(null);
  const [showAds, setShowAds] = useState(false);
  const [houseAd, setHouseAd] = useState<HouseAd | null>(null);
  const [pending, setPending] = useState(false);

  const activeTrack = tracks.find((track) => track.id === state?.track_id) ?? null;
  const activeTrackIndex = tracks.findIndex((track) => track.id === state?.track_id);
  const upNextTrack = tracks.length === 0
    ? null
    : activeTrackIndex >= 0
      ? tracks[(activeTrackIndex + 1) % tracks.length]
      : tracks[0];

  useEffect(() => {
    let active = true;
    let timer: number | undefined;

    async function refreshRoom() {
      try {
        const response = await fetch("/api/rooms/session", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) {
          if (active) setNotice(result.error || "Could not load room data.");
        } else if (active) {
          setRoomTitle(result.room.title);
          setState(result.state);
          setMessages(result.messages);
          setReactions(result.reactions ?? []);
          setHostProfile(result.hostProfile);
          setShowAds(Boolean(result.showAds));
          setHouseAd(result.ad ?? null);
          setIsHost(Boolean(result.isHost));
          setNotice("Connected to the listening room.");
        }
      } catch {
        if (active) setNotice("Room service is unavailable. Try again shortly.");
      } finally {
        if (active) timer = window.setTimeout(refreshRoom, 4000);
      }
    }

    void refreshRoom();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadTracks() {
      try {
        const response = await fetch("/api/rooms/tracks", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load tracks.");
        if (active) setTracks(result.tracks);
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : "Could not load tracks.");
      }
    }
    void loadTracks();
    const refreshTimer = window.setInterval(loadTracks, 50 * 60 * 1000);
    return () => { active = false; window.clearInterval(refreshTimer); };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state || !activeTrack) return;
    const expected = state.position_seconds + (
      state.status === "playing" && state.started_at
        ? Math.max(0, (Date.now() - new Date(state.started_at).getTime()) / 1000)
        : 0
    );
    if (Math.abs(audio.currentTime - expected) > 1.5) audio.currentTime = expected;
    if (state.status === "playing") {
      void audio.play().catch(() => setNotice("Tap Play to start audio in this browser."));
    } else {
      audio.pause();
    }
  }, [state, activeTrack]);

  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    try {
      const response = await fetch("/api/rooms/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error || "Chat is temporarily unavailable.");
        return;
      }
      setMessages((current) => [...current, result.message].slice(-100));
      setBody("");
      setNotice("Message sent.");
    } catch {
      setNotice("Chat is temporarily unavailable.");
    }
  }

  async function sendReaction(reaction: Reaction["reaction"]) {
    try {
      const response = await fetch("/api/rooms/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reaction }),
      });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error || "Reaction could not be sent.");
        return;
      }
      setReactions((current) => [...current, result.reaction].slice(-50));
    } catch {
      setNotice("Reaction service is temporarily unavailable.");
    }
  }

  async function setPlayback(status: "playing" | "paused", trackId = state?.track_id, positionSeconds = audioRef.current?.currentTime ?? 0) {
    if (!isHost || pending || !trackId) return;
    setPending(true);
    try {
      const response = await fetch("/api/rooms/playback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, trackId, positionSeconds }),
      });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error || "Playback command failed.");
        return;
      }
      setState(result.state);
      if (status === "playing") await audioRef.current?.play().catch(() => undefined);
      else audioRef.current?.pause();
      setNotice(status === "playing" ? "Playback started for the room." : "Playback paused for the room.");
    } catch {
      setNotice("Playback service is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  async function selectTrack(track: RoomTrack) {
    if (!isHost || pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/rooms/playback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paused", trackId: track.id, positionSeconds: 0 }),
      });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error || "Could not select that track.");
        return;
      }
      setState(result.state);
      setNotice(`Selected ${track.title}.`);
    } catch {
      setNotice("Playback service is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  async function advanceTrack() {
    if (!activeTrack || tracks.length < 2) {
      if (state?.track_id) await setPlayback("paused", state.track_id, activeTrack?.durationSeconds ?? 0);
      return;
    }
    const nextTrack = tracks[(tracks.findIndex((track) => track.id === activeTrack.id) + 1) % tracks.length];
    await selectTrack(nextTrack);
    await setPlayback("playing", nextTrack.id, 0);
  }

  const recentReactions = reactions.slice(-8);

  return (
    <main className="wrap">
      <header className="nav">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          <LogoMark />
          <div><div>FAMOUS INTROVERT</div><div className="small">LISTENING ROOMS</div></div>
        </Link>
        <span className="tag">INVITE-ONLY ROOM</span>
      </header>

      <section className="hero">
        <div className="eyebrow">You're on the list</div>
        <h1>{roomTitle}</h1>
        <p>Welcome, {displayName}. Listen together and share your reactions live.</p>
        {hostProfile?.display_name && (
          <div className="row" style={{ marginTop: 20 }}>
            {hostProfile.avatar_url && <img src={hostProfile.avatar_url} alt="" width={56} height={56} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: "50%" }} />}
            <div><strong>{hostProfile.display_name}</strong>{hostProfile.bio && <p className="muted" style={{ margin: "4px 0 0" }}>{hostProfile.bio}</p>}</div>
          </div>
        )}
      </section>

      {showAds && houseAd && (
        <aside className="panel" aria-label="Advertisement" style={{ marginBottom: 20 }}>
          <div className="eyebrow">Advertisement</div>
          <h2>{houseAd.title}</h2>
          <p className="muted">{houseAd.body}</p>
          <Link className="btn secondary" href={houseAd.href}>Learn more</Link>
        </aside>
      )}

      <section className="grid">
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Now playing</h2>
            <span className="status">● {state?.status ?? "waiting"}</span>
          </div>
          <div className="player">
            <div className="eyebrow">FAMOUS INTROVERT EXCLUSIVE</div>
            <div className="tracktitle">{activeTrack?.title ?? "Choose a track"}</div>
            <p className="muted">{activeTrack ? "Room playback follows the host." : "The host hasn't added a track to this room yet."}</p>
            <div className="row" aria-live="polite" style={{ justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
              <span className="small">UP NEXT</span>
              <strong>{upNextTrack?.title ?? (tracks.length === 1 ? "End of playlist" : tracks.length === 0 ? "Waiting for playlist" : "Choose a track")}</strong>
            </div>
            <audio
              ref={audioRef}
              src={activeTrack?.url}
              controls
              preload="metadata"
              onEnded={() => { if (isHost) void advanceTrack(); }}
              style={{ width: "100%", marginTop: 10 }}
            />
            {isHost && (
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn" type="button" disabled={pending || !activeTrack} onClick={() => void setPlayback("playing")}>
                  Play for room
                </button>
                <button className="btn secondary" type="button" disabled={pending || !activeTrack} onClick={() => void setPlayback("paused")}>
                  Pause room
                </button>
                <button className="btn secondary" type="button" disabled={pending || tracks.length < 2} onClick={() => void advanceTrack()}>
                  Next track
                </button>
              </div>
            )}
          </div>

          <div className="divider" />
          <h2>Playlist <span className="small">{tracks.length} tracks</span></h2>
          {tracks.length === 0 ? (
            <p className="muted">No audio has been added to this room yet.</p>
          ) : (
            <ol className="chatlog" style={{ height: "auto", maxHeight: 320 }}>
              {tracks.map((track, index) => (
                <li className="message" key={track.id} style={{ listStyle: "none" }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <button
                      className="btn secondary"
                      type="button"
                      aria-current={state?.track_id === track.id ? "true" : undefined}
                      disabled={!isHost || pending}
                      onClick={() => void selectTrack(track)}
                    >
                      {String(index + 1).padStart(2, "0")} · {track.title}
                    </button>
                    <span className="small">{track.durationSeconds ? formatTime(track.durationSeconds) : "Audio"}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="panel">
          <h2>Live chat</h2>
          <p className="muted">Share a thought or send a quick reaction.</p>
          <div className="row" aria-label="Send a reaction">
            {REACTIONS.map((reaction) => (
              <button
                className="btn secondary"
                type="button"
                key={reaction.id}
                aria-label={`Send ${reaction.label} reaction`}
                title={reaction.label}
                onClick={() => void sendReaction(reaction.id)}
              >
                {reaction.symbol}
              </button>
            ))}
          </div>
          {recentReactions.length > 0 && (
            <div className="row" aria-live="polite" style={{ marginTop: 10 }}>
              {recentReactions.map((reaction) => (
                <span className="tag" key={reaction.id} title={`${reaction.display_name} reacted`}>
                  {REACTIONS.find((item) => item.id === reaction.reaction)?.symbol} {reaction.display_name}
                </span>
              ))}
            </div>
          )}
          <div className="chatlog" aria-live="polite">
            {messages.length === 0
              ? <p className="muted">No messages yet. Start the conversation.</p>
              : messages.map((message) => (
                <div className="message" key={message.id}>
                  <strong>{message.display_name}</strong> {message.body}
                  <div className="small">{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              ))}
          </div>
          <form onSubmit={sendChat}>
            <div className="field">
              <label htmlFor="chat">Message as {displayName}</label>
              <input id="chat" value={body} onChange={(event) => setBody(event.target.value)} maxLength={500} placeholder="Share your reaction..." required />
            </div>
            <button className="btn" type="submit">Send message</button>
          </form>
          <div className="divider" />
          <p className="small" role="status">{notice}</p>
        </aside>
      </section>
      <footer className="footer">Private previews · Please do not redistribute unreleased music.</footer>
    </main>
  );
}
