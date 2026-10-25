"use client";

import type React from "react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import LogoMark from "../logo-mark";
import { useRoomVideo } from "./use-room-video";
import "./room-console.css";

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

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

export default function RoomClient({ displayName, previewVideoControls = false }: { displayName: string; previewVideoControls?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [tracks, setTracks] = useState<RoomTrack[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("Connecting to room...");
  const [tipTrackId, setTipTrackId] = useState<string | null>(null);
  const [tipBusy, setTipBusy] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [roomTitle, setRoomTitle] = useState("Listening room");
  const [roomDescription, setRoomDescription] = useState("");
  const [hostProfile, setHostProfile] = useState<HostProfile | null>(null);
  const [showAds, setShowAds] = useState(false);
  const [houseAd, setHouseAd] = useState<HouseAd | null>(null);
  const [pending, setPending] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const padRef = useRef<HTMLDivElement>(null);
  const [padDrag, setPadDrag] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [audioPaused, setAudioPaused] = useState(true);
  const video = useRoomVideo(muted || volume === 0);
  const [floaters, setFloaters] = useState<{ id: string; symbol: string; left: number }[]>([]);
  const seenReactions = useRef<Set<string> | null>(null);
  const clockOffset = useRef(0);
  const lastCommandAt = useRef(0);
  const advancing = useRef(false);
  const urlStamps = useRef<Map<string, { url: string; at: number }>>(new Map());
  const [synced, setSynced] = useState(true);
  const chatLogRef = useRef<HTMLDivElement>(null);

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
          setRoomDescription(result.room.description ?? "");
          if (typeof result.serverTime === "number") clockOffset.current = result.serverTime - Date.now();
          const next = result.state as RoomState | null;
          // A fresh local command wins over a poll that may have been read before it landed.
          if (Date.now() - lastCommandAt.current > 2500) {
            setState((current) => (
              current && next && current.track_id === next.track_id && current.status === next.status &&
              current.started_at === next.started_at && current.position_seconds === next.position_seconds
                ? current
                : next
            ));
          }
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
        if (active) timer = window.setTimeout(refreshRoom, 2000);
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
        if (active) {
          const now = Date.now();
          const incoming = result.tracks as RoomTrack[];
          // Re-signed URLs differ every poll; swapping src would reload the audio and make songs stall.
          const merged = incoming.map((track) => {
            const known = urlStamps.current.get(track.id);
            if (known && now - known.at < 40 * 60_000) return { ...track, url: known.url };
            urlStamps.current.set(track.id, { url: track.url, at: now });
            return track;
          });
          setTracks((current) => (
            current.length === merged.length && current.every((track, i) => (
              track.id === merged[i].id && track.title === merged[i].title && track.url === merged[i].url &&
              track.durationSeconds === merged[i].durationSeconds
            )) ? current : merged
          ));
        }
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : "Could not load tracks.");
      }
    }
    void loadTracks();
    const refreshTimer = window.setInterval(loadTracks, 5_000);
    return () => { active = false; window.clearInterval(refreshTimer); };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, activeTrack?.id]);

  const expectedPosition = useCallback(() => {
    if (!state) return 0;
    return state.position_seconds + (
      state.status === "playing" && state.started_at
        ? Math.max(0, (Date.now() + clockOffset.current - new Date(state.started_at).getTime()) / 1000)
        : 0
    );
  }, [state]);

  const syncAudio = useCallback((hard = false) => {
    const audio = audioRef.current;
    if (!audio || !state || !state.track_id) return;
    if (state.status !== "playing") {
      audio.playbackRate = 1;
      audio.pause();
      if (audio.readyState > 0 && Math.abs(audio.currentTime - state.position_seconds) > 0.5) audio.currentTime = state.position_seconds;
      setSynced(true);
      return;
    }
    const drift = audio.currentTime - expectedPosition();
    if (audio.readyState === 0) return;
    if (hard || Math.abs(drift) > 1.2) {
      audio.currentTime = expectedPosition();
      audio.playbackRate = 1;
    } else if (Math.abs(drift) > 0.25) {
      // Small drift is corrected by gently speeding up or slowing down, which is inaudible.
      audio.playbackRate = drift > 0 ? 0.97 : 1.03;
    } else {
      audio.playbackRate = 1;
    }
    setSynced(Math.abs(drift) < 1.2);
    if (audio.paused) void audio.play().catch(() => setNotice("Tap Play to start audio in this browser."));
  }, [state, expectedPosition]);

  useEffect(() => {
    syncAudio();
    const timer = window.setInterval(() => syncAudio(), 1000);
    return () => window.clearInterval(timer);
  }, [syncAudio, activeTrack?.id]);

  useEffect(() => {
    // Reactions that arrive after the first load float up over the stage.
    if (!state) return;
    if (seenReactions.current === null) {
      seenReactions.current = new Set(reactions.map((reaction) => reaction.id));
      return;
    }
    const seen = seenReactions.current;
    const fresh = reactions.filter((reaction) => !seen.has(reaction.id));
    if (fresh.length === 0) return;
    fresh.forEach((reaction) => seen.add(reaction.id));
    const added = fresh.slice(-6).map((reaction) => ({
      id: reaction.id,
      symbol: REACTIONS.find((item) => item.id === reaction.reaction)?.symbol ?? "♥",
      left: 8 + (hashString(reaction.id) % 80),
    }));
    setFloaters((current) => [...current, ...added].slice(-24));
    const ids = new Set(added.map((item) => item.id));
    window.setTimeout(() => setFloaters((current) => current.filter((item) => !ids.has(item.id))), 3400);
  }, [reactions, state]);

  useEffect(() => {
    const log = chatLogRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages]);

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
    if (!isHost || !trackId || !state) return;
    const previous = state;
    const sentAt = Date.now();
    lastCommandAt.current = sentAt;
    // Apply the command locally first so the controls respond instantly.
    setState({
      ...state,
      track_id: trackId,
      status,
      position_seconds: positionSeconds,
      started_at: status === "playing" ? new Date(sentAt + clockOffset.current).toISOString() : null,
    });
    const audio = audioRef.current;
    if (audio && trackId === previous.track_id) {
      audio.currentTime = positionSeconds;
      if (status === "playing") void audio.play().catch(() => undefined);
      else audio.pause();
    }
    setPending(true);
    try {
      const response = await fetch("/api/rooms/playback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, trackId, positionSeconds }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (lastCommandAt.current === sentAt) setState(previous);
        setNotice(result.error || "Playback command failed.");
        return;
      }
      if (lastCommandAt.current === sentAt) {
        setState(result.state);
        lastCommandAt.current = Date.now() - 1500;
      }
    } catch {
      if (lastCommandAt.current === sentAt) setState(previous);
      setNotice("Playback service is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  async function startTip(track: RoomTrack, amountCents: number) {
    setTipBusy(true);
    try {
      const response = await fetch("/api/rooms/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id, amountCents }),
      });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error || "Could not start the tip.");
        return;
      }
      window.location.assign(result.url);
    } catch {
      setNotice("Tip service is temporarily unavailable.");
    } finally {
      setTipBusy(false);
    }
  }

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("tip");
    if (!result) return;
    window.history.replaceState(null, "", window.location.pathname);
    setNotice(result === "ok"
      ? "Thanks for the tip! Your song moves up to play next."
      : "Your tip was not completed, so nothing was charged.");
  }, []);

  async function selectTrack(track: RoomTrack) {
    if (!isHost) return;
    await setPlayback(isPlaying ? "playing" : "paused", track.id, 0);
  }

  async function advanceTrack() {
    if (advancing.current) return;
    advancing.current = true;
    window.setTimeout(() => { advancing.current = false; }, 1500);
    if (!activeTrack || tracks.length < 2) {
      if (state?.track_id) await setPlayback("paused", state.track_id, activeTrack?.durationSeconds ?? 0);
      return;
    }
    const nextTrack = tracks[(tracks.findIndex((track) => track.id === activeTrack.id) + 1) % tracks.length];
    await setPlayback("playing", nextTrack.id, 0);
  }

  async function previousTrack() {
    if (!activeTrack) return;
    const index = tracks.findIndex((track) => track.id === activeTrack.id);
    // Like most players: restart the song first, go back only when already near the start.
    if ((audioRef.current?.currentTime ?? 0) > 3 || index <= 0) {
      await setPlayback(isPlaying ? "playing" : "paused", activeTrack.id, 0);
      return;
    }
    await setPlayback(isPlaying ? "playing" : "paused", tracks[index - 1].id, 0);
  }

  async function seekTo(seconds: number) {
    if (!activeTrack) return;
    const limit = activeTrack.durationSeconds ?? (duration || seconds);
    await setPlayback(isPlaying ? "playing" : "paused", activeTrack.id, Math.max(0, Math.min(seconds, limit)));
  }

  async function commitScrub() {
    if (scrub === null) return;
    const target = scrub;
    setScrub(null);
    await seekTo(target);
  }

  async function moveTrack(from: number, to: number) {
    if (!isHost || reordering || from === to || to < 0 || to >= tracks.length || !state) return;
    const previous = tracks;
    const reordered = [...tracks];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setTracks(reordered);
    setReordering(true);
    try {
      const response = await fetch("/api/host/rooms/tracks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: state.room_id, trackIds: reordered.map((track) => track.id) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not reorder playlist.");
      setNotice(`Moved ${moved.title}.`);
    } catch (error) {
      setTracks(previous);
      setNotice(error instanceof Error ? error.message : "Could not reorder playlist.");
    } finally {
      setReordering(false);
    }
  }

  useEffect(() => {
    if (!isHost) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const now = audioRef.current?.currentTime ?? 0;
      if (event.code === "Space") { event.preventDefault(); void setPlayback(state?.status === "playing" ? "paused" : "playing"); }
      else if (event.code === "ArrowRight") { event.preventDefault(); void seekTo(now + 15); }
      else if (event.code === "ArrowLeft") { event.preventDefault(); void seekTo(now - 15); }
      else if (event.key === "n" || event.key === "N") void advanceTrack();
      else if (event.key === "p" || event.key === "P") void previousTrack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function padPoint(event: React.PointerEvent<HTMLDivElement>) {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height)),
    };
  }

  function padMove(event: React.PointerEvent<HTMLDivElement>) {
    const point = padPoint(event);
    if (!point) return;
    setVolume(point.y);
    setMuted(false);
    if (isHost && trackLength > 0) setScrub(point.x * trackLength);
  }

  function padRelease() {
    setPadDrag(false);
    if (isHost) void commitScrub();
  }

  const hue = hashString(roomTitle) % 360;
  const isPlaying = state?.status === "playing";
  const showLive = isPlaying || video.hasVideo;
  const trackLength = activeTrack?.durationSeconds ?? (duration || 0);
  const progress = trackLength > 0 ? Math.min(100, (currentTime / trackLength) * 100) : 0;
  const participants = new Set([...messages.map((m) => m.display_name), ...reactions.map((r) => r.display_name), displayName]).size;
  const hostInitial = (hostProfile?.display_name || "H").charAt(0).toUpperCase();

  return (
    <main className="wrap rm-wrap">
      <header className="nav">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          <LogoMark />
          <div><div>FAMOUS INTROVERT</div><div className="small">LISTENING ROOMS</div></div>
        </Link>
        <span className="tag">INVITE-ONLY ROOM</span>
      </header>

      <div className="rm-layout">
        <div className="rm-main">
          <div className={`rm-stage ${video.hasVideo ? "has-video" : ""}`} style={{ ["--hue" as string]: hue }}>
            <div className="rm-glow" aria-hidden="true" />
            <video ref={video.videoRef} className="rm-video" autoPlay playsInline muted aria-label="Host live video" />
            <div ref={video.audioBoxRef} hidden />
            <div className="rm-badges">
              <span className={`rm-live ${showLive ? "on" : ""}`}>{showLive ? "● LIVE" : "❚❚ PAUSED"}</span>
              <span className="rm-viewers">👥 {participants} in the room</span>
            </div>
            <div className="rm-art-wrap">
              <div className={`rm-art ${isPlaying ? "spin" : ""}`}>
                <div className="rm-art-label">{(activeTrack?.title ?? roomTitle).slice(0, 2).toUpperCase()}</div>
              </div>
              <div className={`rm-eq ${isPlaying ? "on" : ""}`} aria-hidden="true">
                {Array.from({ length: 24 }, (_, i) => (
                  <span key={i} style={{ animationDelay: `${(i % 8) * 0.12}s`, height: `${30 + ((i * 37) % 70)}%` }} />
                ))}
              </div>
            </div>
            <div className="rm-floaters" aria-hidden="true">
              {floaters.map((floater) => (
                <span key={floater.id} style={{ left: `${floater.left}%` }}>{floater.symbol}</span>
              ))}
            </div>
            <div className="rm-overlay">
              <div className="rm-now">
                <span className="rm-now-label">NOW PLAYING</span>
                <strong>{activeTrack?.title ?? "Waiting for the host"}</strong>
              </div>
              <div className="rm-controls">
                <span className="rm-time">{formatTime(scrub ?? currentTime)} / {formatTime(trackLength)}</span>
                <div className="row">
                  {activeTrack && !isHost && (
                    <button className={`rm-pill ghost ${synced ? "" : "warn"}`} type="button" onClick={() => syncAudio(true)}>
                      {synced ? "● In sync" : "↻ Resync to live"}
                    </button>
                  )}
                  <div className="rm-vol-hover">
                    <button
                      className="rm-vol-icon"
                      type="button"
                      aria-pressed={muted}
                      aria-label={muted ? "Unmute" : "Mute"}
                      onClick={() => setMuted((value) => !value)}
                    >
                      {muted || volume === 0 ? "🔇" : volume < 0.4 ? "🔈" : volume < 0.75 ? "🔉" : "🔊"}
                    </button>
                    <input
                      className="rm-seek rm-vol-range"
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round((muted ? 0 : volume) * 100)}
                      style={{ ["--pct" as string]: `${Math.round((muted ? 0 : volume) * 100)}%` }}
                      aria-label="Volume"
                      onChange={(event) => { setVolume(Number(event.target.value) / 100); setMuted(false); }}
                    />
                  </div>
                  {activeTrack && (
                    <button
                      className="rm-play"
                      type="button"
                      aria-label={isHost ? (isPlaying ? "Pause for the room" : "Play for the room") : (audioPaused ? "Play audio on this device" : "Pause audio on this device")}
                      onClick={() => {
                        if (isHost) void setPlayback(isPlaying ? "paused" : "playing");
                        else if (audioPaused) void audioRef.current?.play().catch(() => setNotice("Tap Play to start audio in this browser."));
                        else audioRef.current?.pause();
                      }}
                    >
                      {(isHost ? isPlaying : !audioPaused) ? "❚❚" : "▶"}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <audio
              ref={audioRef}
              src={activeTrack?.url || undefined}
              muted={muted}
              preload="metadata"
              onPlay={() => setAudioPaused(false)}
              onPause={() => setAudioPaused(true)}
              onTimeUpdate={(event) => {
                const audio = event.currentTarget;
                setCurrentTime(audio.currentTime);
                // Advance just before the end so there is no dead air between songs.
                if (isHost && isPlaying && audio.duration > 2 && audio.currentTime >= audio.duration - 0.2) void advanceTrack();
              }}
              onLoadedMetadata={(event) => { setDuration(event.currentTarget.duration); syncAudio(true); }}
              onCanPlay={() => syncAudio()}
              onEnded={() => { if (isHost) void advanceTrack(); }}
              onError={() => { urlStamps.current.clear(); setNotice("Audio stalled. Reloading the track..."); }}
            />
            {upNextTrack?.url && upNextTrack.id !== activeTrack?.id && (
              <audio src={upNextTrack.url} preload="auto" hidden aria-hidden="true" />
            )}
          </div>

          <div className="rm-info">
            <h1>{roomTitle}</h1>
            <div className="rm-host">
              {hostProfile?.avatar_url
                ? <img src={hostProfile.avatar_url} alt="" className="rm-avatar" />
                : <span className="rm-avatar fallback">{hostInitial}</span>}
              <div>
                <strong>{hostProfile?.display_name ?? "Host"} <span className="rm-verified">HOST</span></strong>
                {hostProfile?.bio && <p className="small">{hostProfile.bio}</p>}
              </div>
            </div>
            {roomDescription && <p className="rm-desc">{roomDescription}</p>}
            <p className="small">Welcome, {displayName}. Listen together and share your reactions live.</p>
          </div>

          <div className="rm-reactions" aria-label="Send a reaction">
            {REACTIONS.map((reaction) => (
              <button
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

          {showAds && houseAd && (
            <aside className="rm-ad" aria-label="Advertisement">
              <div className="eyebrow">Advertisement</div>
              <h2>{houseAd.title}</h2>
              <p className="muted">{houseAd.body}</p>
              <Link className="btn secondary" href={houseAd.href}>Learn more</Link>
            </aside>
          )}

          {isHost && (
            <div className="rm-host-controls">
              <strong>Host controls</strong>
              {(video.canPublish || previewVideoControls) && (
                <div className="row">
                  <button className={`btn ${video.cameraOn ? "" : "secondary"}`} type="button" aria-pressed={video.cameraOn} onClick={() => void video.toggleCamera()}>
                    {video.cameraOn ? "■ Stop camera" : "🎥 Share camera"}
                  </button>
                  <button className={`btn ${video.screenOn ? "" : "secondary"}`} type="button" aria-pressed={video.screenOn} onClick={() => void video.toggleScreen()}>
                    {video.screenOn ? "■ Stop screen share" : "🖥 Share screen"}
                  </button>
                </div>
              )}
              {video.serverReady === false && !previewVideoControls && (
                <p className="small">Camera and screen sharing are off until live video (LiveKit) is set up on the server.</p>
              )}
              {video.error && <p className="small" role="alert">{video.error}</p>}
              <div className="rm-transport">
                <button className="btn secondary" type="button" disabled={!activeTrack} onClick={() => void previousTrack()}>
                  ⏮ Previous
                </button>
                <button className="btn secondary" type="button" disabled={!activeTrack} onClick={() => void seekTo((audioRef.current?.currentTime ?? 0) - 15)}>
                  ⏪ 15s
                </button>
                <button className="btn" type="button" disabled={!activeTrack} onClick={() => void setPlayback(isPlaying ? "paused" : "playing")}>
                  {isPlaying ? "❚❚ Pause room" : "▶ Play for room"}
                </button>
                <button className="btn secondary" type="button" disabled={!activeTrack} onClick={() => void seekTo((audioRef.current?.currentTime ?? 0) + 15)}>
                  15s ⏩
                </button>
                <button className="btn secondary" type="button" disabled={tracks.length < 2} onClick={() => void advanceTrack()}>
                  Next ⏭
                </button>
              </div>
              <p className="small">Use the track pad below to jump the whole room. Shortcuts: Space play/pause, ←/→ 15s, N next, P previous.</p>
            </div>
          )}

          <section className="rm-playlist" aria-labelledby="playlist-title">
            <div className="rm-mixer" aria-label="Audio controls">
              <div
                ref={padRef}
                className={`rm-pad ${padDrag ? "active" : ""}`}
                role="group"
                aria-label={isHost ? "Track pad: drag up and down for volume, left and right to seek the room" : "Track pad: drag up and down for volume"}
                onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setPadDrag(true); padMove(event); }}
                onPointerMove={(event) => { if (padDrag) padMove(event); }}
                onPointerUp={padRelease}
                onPointerCancel={padRelease}
              >
                <span className="rm-pad-label rm-pad-y">Volume ↕</span>
                {isHost && <span className="rm-pad-label rm-pad-x">Seek ↔</span>}
                <span className="rm-pad-line" style={{ left: `${trackLength > 0 ? Math.min(100, ((scrub ?? currentTime) / trackLength) * 100) : 0}%` }} />
                <span className="rm-pad-dot" style={{ left: `${trackLength > 0 ? Math.min(100, ((scrub ?? currentTime) / trackLength) * 100) : 50}%`, bottom: `${Math.round((muted ? 0 : volume) * 100)}%` }} />
              </div>
            </div>
            <h2 id="playlist-title">Up next <span className="small">{tracks.length} tracks</span></h2>
            {upNextTrack && <p className="small" aria-live="polite">Next: <strong>{upNextTrack.title}</strong></p>}
            {isHost && tracks.length > 1 && <p className="small">Drag tracks or use the arrows to reorder the playlist while live.</p>}
            {tracks.length === 0 ? (
              <p className="muted">No audio has been added to this room yet.</p>
            ) : (
              <ol>
                {tracks.map((track, index) => {
                  const current = state?.track_id === track.id;
                  return (
                    <li
                      key={track.id}
                      className={dragIndex === index ? "dragging" : ""}
                      draggable={isHost && !reordering}
                      onDragStart={() => setDragIndex(index)}
                      onDragOver={(event) => { if (dragIndex !== null) event.preventDefault(); }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (dragIndex !== null) void moveTrack(dragIndex, index);
                        setDragIndex(null);
                      }}
                      onDragEnd={() => setDragIndex(null)}
                    >
                      <button
                        type="button"
                        className={`rm-select ${current ? "current" : ""}`}
                        aria-current={current ? "true" : undefined}
                        disabled={!isHost || pending}
                        onClick={() => void selectTrack(track)}
                      >
                        <span className="rm-thumb" style={{ ["--hue" as string]: (hashString(track.title) % 360) }}>
                          {current && isPlaying ? "♪" : String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="rm-track-title">{track.title}</span>
                        <span className="small">{track.durationSeconds ? formatTime(track.durationSeconds) : "Audio"}</span>
                      </button>
                      {!isHost && !current && (
                        <button type="button" className="rm-boost" disabled={tipBusy} onClick={() => setTipTrackId(tipTrackId === track.id ? null : track.id)}>
                          ⚡ Boost
                        </button>
                      )}
                      {tipTrackId === track.id && !isHost && (
                        <span className="rm-tip-menu" role="group" aria-label={`Tip to boost ${track.title}`}>
                          <span className="small">Tip to play next:</span>
                          {[300, 500, 1000].map((cents) => (
                            <button key={cents} type="button" disabled={tipBusy} onClick={() => void startTip(track, cents)}>
                              ${cents / 100}
                            </button>
                          ))}
                        </span>
                      )}
                      {isHost && (
                        <span className="rm-reorder">
                          <button type="button" aria-label={`Move ${track.title} up`} disabled={reordering || index === 0} onClick={() => void moveTrack(index, index - 1)}>▲</button>
                          <button type="button" aria-label={`Move ${track.title} down`} disabled={reordering || index === tracks.length - 1} onClick={() => void moveTrack(index, index + 1)}>▼</button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>


        <aside className="rm-chat" aria-labelledby="live-chat-title">
          <div className="rm-chat-head">
            <h2 id="live-chat-title">Live chat</h2>
            <span className="small">{participants} here</span>
          </div>
          <div className="rm-chatlog" ref={chatLogRef} aria-live="polite">
            {messages.length === 0
              ? <p className="muted">No messages yet. Start the conversation.</p>
              : messages.map((message) => {
                const fromHost = message.display_name === hostProfile?.display_name;
                return (
                  <div className={`rm-msg ${fromHost ? "host" : ""}`} key={message.id}>
                    <span className="rm-msg-avatar" style={{ ["--hue" as string]: (hashString(message.display_name) % 360) }}>
                      {message.display_name.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <strong>{message.display_name}</strong>
                      {fromHost && <span className="rm-verified">HOST</span>}
                      <span className="rm-msg-time">{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <p>{message.body}</p>
                    </div>
                  </div>
                );
              })}
          </div>
          <form className="rm-chat-form" onSubmit={sendChat}>
            <label className="rm-sr" htmlFor="chat">Message as {displayName}</label>
            <input id="chat" value={body} onChange={(event) => setBody(event.target.value)} maxLength={500} placeholder={`Chat as ${displayName}...`} required />
            <button className="rm-send" type="submit" aria-label="Send message">➤</button>
          </form>
          <p className="small rm-notice" role="status">{notice}</p>
        </aside>
      </div>
      <footer className="footer">Private previews · Please do not redistribute unreleased music.</footer>
    </main>
  );
}
