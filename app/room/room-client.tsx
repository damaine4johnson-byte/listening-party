"use client";

import type React from "react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import LogoMark from "../logo-mark";
import { useRoomVideo } from "./use-room-video";
import RoomTrackManager from "../host/room-track-manager";
import "./room-console.css";
import { useRoomSession, useRoomTracks } from "./use-room-session";
import { useAudioSync } from "./use-audio-sync";
import { useTipping, usePlaylistReorder } from "./use-tipping";
import { useBackgroundPlayback } from "./use-background-playback";
import TipCelebration from "./tip-celebration";
import { TipBadge } from "./tip-medal";
import { Playlist, ChatLog, ChatAvatar } from "./room-panels";
import { resizeToJpeg, formatTime, hashString } from "./room-types";
import type { ChatMessage, Reaction, RoomState, RoomTrack } from "./room-types";

export default function RoomClient({ displayName, previewVideoControls = false }: { displayName: string; previewVideoControls?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [avatarVersion, setAvatarVersion] = useState(() => Date.now());
  const [notice, setNotice] = useState("Connecting to room...");
  const [panelOpen, setPanelOpen] = useState(false);
  const [viewerData, setViewerData] = useState<Awaited<ReturnType<typeof fetch>> extends never ? never : {
    viewers: { name: string; spentCents: number; tipCents: number; tipCount: number; rank: number | null; joinedAt: string }[];
    recentJoins: { name: string; joinedAt: string }[];
    totalTipCents: number;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [scrub, setScrub] = useState<number | null>(null);
  const [floaters, setFloaters] = useState<{ id: string; symbol: string; left: number }[]>([]);
  const [ending, setEnding] = useState(false);
  const [mirrored, setMirrored] = useState(false);
  const seenReactions = useRef<Set<string> | null>(null);
  const advancing = useRef(false);

  useEffect(() => { setMirrored(window.localStorage.getItem("room-video-mirrored") === "1"); }, []);
  const toggleMirror = () => setMirrored((current) => {
    window.localStorage.setItem("room-video-mirrored", current ? "0" : "1");
    return !current;
  });

  const video = useRoomVideo(muted || volume === 0);

  const {
    roomTitle, coverUrl, roomDescription, hostProfile, showAds, houseAd, isHost,
    viewerCount, inviteCode, state, messages, reactions, ended, endSession,
    coinSignedIn, coinBalance, refreshCoinBalance, lastCommandAt, clockOffset, setState,
    tipAlerts, appendMessage, appendReaction,
  } = useRoomSession(() => {
    audioRef.current?.pause();
    void video.stopAll();
  }, setNotice);

  const { tracks, setTracks, clearUrlStamps } = useRoomTracks();
  const { syncAudio, synced, audioPaused, expectedPosition, onAudioPlay, onAudioPause } = useAudioSync({
    state,
    audioRef,
    clockOffset,
    onNotice: setNotice,
  });
  const { tipTrackId, setTipTrackId, tipBusy, startTip, startCoinTip } = useTipping({ onNotice: setNotice, refreshCoinBalance });
  const { reordering, dragIndex, setDragIndex, moveTrack } = usePlaylistReorder(setNotice);

  const activeTrack = tracks.find((track) => track.id === state?.track_id) ?? null;
  const activeTrackIndex = tracks.findIndex((track) => track.id === state?.track_id);
  const upNextTrack = tracks.length === 0
    ? null
    : activeTrackIndex >= 0
      ? tracks[(activeTrackIndex + 1) % tracks.length]
      : tracks[0];
  const isPlaying = state?.status === "playing";
  const resumeAudio = useCallback(() => syncAudio(true), [syncAudio]);
  useBackgroundPlayback({
    audioRef,
    title: activeTrack?.title ?? roomTitle,
    artist: hostProfile?.display_name ?? "Famous Introvert Listening Rooms",
    artworkUrl: coverUrl ?? hostProfile?.avatar_url ?? null,
    active: Boolean(activeTrack) || video.hasVideo,
    playing: isPlaying || video.hasVideo,
    isHost,
    onResume: resumeAudio,
  });

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, activeTrack?.id]);

  // Reactions that arrive after the first load float up over the stage.
  useEffect(() => {
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

  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = (event.currentTarget.elements.namedItem("chat") as HTMLInputElement | null)?.value ?? "";
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
      appendMessage(result.message);
      event.currentTarget.reset();
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
      appendReaction(result.reaction);
    } catch {
      setNotice("Reaction service is temporarily unavailable.");
    }
  }

  useEffect(() => {
    if (!isHost || !panelOpen) return;
    let active = true;
    let timer: number | undefined;
    async function load() {
      try {
        const response = await fetch("/api/host/viewers", { cache: "no-store" });
        if (response.ok && active) setViewerData(await response.json());
      } catch { /* the next poll retries */ }
      if (active) timer = window.setTimeout(load, 5000);
    }
    void load();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [isHost, panelOpen]);

  async function chooseAvatar(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("Choose an image file.");
      return;
    }
    try {
      const image = await resizeToJpeg(file);
      const response = await fetch("/api/rooms/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(result.error || "Could not save your photo.");
        return;
      }
      setAvatarVersion(Date.now());
      setNotice("Photo updated.");
    } catch {
      setNotice("Could not read that image.");
    }
  }

  async function endStream() {
    if (!state?.room_id || ending) return;
    if (!window.confirm("End the live stream for everyone? Listeners will be disconnected and the room will close.")) return;
    setEnding(true);
    try {
      await video.stopAll();
      audioRef.current?.pause();
      const response = await fetch("/api/host/rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: state.room_id, status: "ended" }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setNotice(result.error || "Could not end the stream.");
        setEnding(false);
        return;
      }
      window.location.assign("/host");
    } catch {
      setNotice("Room service is unavailable. Try again shortly.");
      setEnding(false);
    }
  }

  const setPlayback = useCallback(async (status: "playing" | "paused", trackId = state?.track_id, positionSeconds = audioRef.current?.currentTime ?? 0) => {
    if (!isHost || !trackId || !state) return;
    const previous = state;
    const sentAt = Date.now();
    lastCommandAt.current = sentAt;
    // Apply the command locally first so the controls respond instantly.
    setState(() => ({
      ...state,
      track_id: trackId,
      status,
      position_seconds: positionSeconds,
      started_at: status === "playing" ? new Date(sentAt + clockOffset.current).toISOString() : null,
    }));
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
        if (lastCommandAt.current === sentAt) setState(() => previous);
        setNotice(result.error || "Playback command failed.");
        return;
      }
      if (lastCommandAt.current === sentAt) {
        setState(() => result.state);
        lastCommandAt.current = Date.now() - 1500;
      }
    } catch {
      if (lastCommandAt.current === sentAt) setState(() => previous);
      setNotice("Playback service is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }, [isHost, state, lastCommandAt, clockOffset, setState, setNotice]);

  const advanceTrack = useCallback(async () => {
    if (advancing.current) return;
    advancing.current = true;
    window.setTimeout(() => { advancing.current = false; }, 1500);
    if (!activeTrack || tracks.length < 2) {
      if (state?.track_id) await setPlayback("paused", state.track_id, activeTrack?.durationSeconds ?? 0);
      return;
    }
    const nextTrack = tracks[(tracks.findIndex((track) => track.id === activeTrack.id) + 1) % tracks.length];
    await setPlayback("playing", nextTrack.id, 0);
  }, [activeTrack, tracks, state?.track_id, setPlayback]);

  const previousTrack = useCallback(async () => {
    if (!activeTrack) return;
    const index = tracks.findIndex((track) => track.id === activeTrack.id);
    // Like most players: restart the song first, go back only when already near the start.
    if ((audioRef.current?.currentTime ?? 0) > 3 || index <= 0) {
      await setPlayback(isPlaying ? "playing" : "paused", activeTrack.id, 0);
      return;
    }
    await setPlayback(isPlaying ? "playing" : "paused", tracks[index - 1].id, 0);
  }, [activeTrack, tracks, isPlaying, setPlayback]);

  const seekTo = useCallback(async (seconds: number) => {
    if (!activeTrack) return;
    const limit = activeTrack.durationSeconds ?? (duration || seconds);
    await setPlayback(isPlaying ? "playing" : "paused", activeTrack.id, Math.max(0, Math.min(seconds, limit)));
  }, [activeTrack, duration, isPlaying, setPlayback]);

  async function commitScrub() {
    if (scrub === null) return;
    const target = scrub;
    setScrub(null);
    await seekTo(target);
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
    // Handlers are stable useCallbacks (see above), so this dep list is both
    // fresh and non-churning: re-added only when playback state or handlers change.
  }, [isHost, state?.status, setPlayback, seekTo, advanceTrack, previousTrack]);

  const hue = hashString(roomTitle) % 360;
  const showLive = isPlaying || video.hasVideo;
  const trackLength = activeTrack?.durationSeconds ?? (duration || 0);
  const progress = trackLength > 0 ? Math.min(100, (currentTime / trackLength) * 100) : 0;
  const participants = new Set([...messages.map((m) => m.display_name), ...reactions.map((r) => r.display_name), displayName]).size;
  const hostInitial = (hostProfile?.display_name || "H").charAt(0).toUpperCase();

  if (ended) {
    return (
      <main className="wrap rm-wrap">
        <div className="rm-ended" role="status">
          <h1>This listening room has ended</h1>
          <p className="muted">Thanks for listening. The host has closed the stream.</p>
          <Link className="btn" href="/">Back to home</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap rm-wrap">
      <header className="nav">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          <LogoMark />
          <div><div>FAMOUS INTROVERT</div><div className="small">LISTENING ROOMS</div></div>
        </Link>
        <span className="tag">INVITE-ONLY ROOM</span>
      </header>

      <TipCelebration alerts={tipAlerts} />

      <div className="rm-layout">
        <div className="rm-main">
          <div className={`rm-stage ${video.hasVideo ? "has-video" : ""}`} style={{ ["--hue" as string]: hue }}>
            {coverUrl && <img className="rm-cover" src={coverUrl} alt="" aria-hidden="true" />}
            <div className="rm-glow" aria-hidden="true" />
            <video ref={video.videoRef} className={`rm-video ${mirrored ? "mirrored" : ""}`} autoPlay playsInline muted aria-label="Host live video" />
            <div ref={video.audioBoxRef} hidden />
            {video.hasVideo && (
              <button className="rm-mirror" type="button" aria-pressed={mirrored} onClick={toggleMirror}>
                ⇋ {mirrored ? "Unmirror" : "Mirror"} video
              </button>
            )}
            <div className="rm-badges">
              <span className={`rm-live ${showLive ? "on" : ""}`}>{showLive ? "● LIVE" : "❚❚ PAUSED"}</span>
              <span className="rm-viewers">👥 {viewerCount ?? participants} in the room</span>
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
            <div className="rm-tip-alerts" role="status" aria-live="polite">
              {tipAlerts.map((tip) => (
                <div className="rm-tip-alert" key={tip.id}>
                  <span className="rm-tip-icon" aria-hidden="true">💸</span>
                  <span>
                    <strong>{tip.name}</strong> <TipBadge tierId={tip.badge} showLabel={false} /> tipped <b>${(tip.amountCents / 100).toLocaleString(undefined, { minimumFractionDigits: tip.amountCents % 100 ? 2 : 0 })}</b>
                    {tip.song && <> to boost <em>{tip.song}</em></>}
                  </span>
                </div>
              ))}
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
              onPlay={() => { onAudioPlay(); }}
              onPause={onAudioPause}
              onTimeUpdate={(event) => {
                const audio = event.currentTarget;
                setCurrentTime(audio.currentTime);
                // Advance just before the end so there is no dead air between songs.
                if (isHost && isPlaying && audio.duration > 2 && audio.currentTime >= audio.duration - 0.2) void advanceTrack();
              }}
              onLoadedMetadata={(event) => { setDuration(event.currentTarget.duration); syncAudio(true); }}
              onCanPlay={() => syncAudio()}
              onEnded={() => { if (isHost) void advanceTrack(); }}
              onError={() => { clearUrlStamps(); setNotice("Audio stalled. Reloading the track..."); }}
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
              <div className="rm-invite">
                <span className="small">Invite code</span>
                {inviteCode ? (
                  <>
                    <code>{inviteCode}</code>
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => {
                        const link = new URL("/", window.location.origin);
                        link.searchParams.set("invite", inviteCode);
                        link.hash = "enter-room";
                        navigator.clipboard.writeText(link.toString()).then(
                          () => setNotice("Invite link copied."),
                          () => setNotice("Copy failed. Select the code manually."),
                        );
                      }}
                    >
                      Copy invite link
                    </button>
                  </>
                ) : (
                  <span className="small">Not saved for this room. Generate a new invite from the host dashboard to see it here.</span>
                )}
              </div>
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
              <p className="small">Shortcuts: Space play/pause, ←/→ 15s, N next, P previous.</p>
              <button className="btn rm-end" type="button" disabled={ending} onClick={() => void endStream()}>
                {ending ? "Ending..." : "■ End live stream"}
              </button>
              {state?.room_id && (
                <details className="rm-add-songs">
                  <summary>＋ Add songs while live</summary>
                  <RoomTrackManager roomId={state.room_id} />
                </details>
              )}
            </div>
          )}

          <Playlist
            tracks={tracks}
            activeTrackId={state?.track_id ?? null}
            isPlaying={isPlaying}
            isHost={isHost}
            pending={pending}
            roomTitle={roomTitle}
            upNextTrack={upNextTrack}
            reordering={reordering}
            dragIndex={dragIndex}
            setDragIndex={setDragIndex}
            tipTrackId={tipTrackId}
            tipBusy={tipBusy}
            coinSignedIn={coinSignedIn}
            coinBalance={coinBalance}
            onSelectTrack={(track) => void setPlayback(isPlaying ? "playing" : "paused", track.id, 0)}
            onMoveTrack={(from, to) => void moveTrack(state?.room_id, tracks, setTracks, from, to)}
            onToggleTipMenu={(trackId) => setTipTrackId(tipTrackId === trackId ? null : trackId)}
            onStartCardTip={(track, cents) => void startTip(track, cents)}
            onStartCoinTip={(track, coins) => void startCoinTip(track, coins)}
          />
        </div>


        <aside className="rm-chat" aria-labelledby="live-chat-title">
          <div className="rm-chat-head">
            <h2 id="live-chat-title">Live chat</h2>
            <span className="small">{viewerCount ?? participants} here</span>
            {isHost && (
              <button className="rm-photo-btn" type="button" aria-expanded={panelOpen} onClick={() => setPanelOpen((open) => !open)}>
                👥 Viewers
              </button>
            )}
            {!isHost && (
              <label className="rm-photo-btn" title="Add or change your photo">
                📷 Photo
                <input type="file" accept="image/*" hidden onChange={(event) => { void chooseAvatar(event.target.files?.[0]); event.target.value = ""; }} />
              </label>
            )}
          </div>
          {isHost && panelOpen && (
            <div className="rm-viewers-panel" role="region" aria-label="Current viewers">
              <div className="rm-vp-head">
                <strong>Viewers · {viewerData?.viewers.length ?? viewerCount ?? 0}</strong>
                <span className="small">Tips {viewerData ? `$${(viewerData.totalTipCents / 100).toLocaleString()}` : "—"}</span>
                <button type="button" className="rm-vp-close" aria-label="Close viewers panel" onClick={() => setPanelOpen(false)}>✕</button>
              </div>
              {viewerData && viewerData.recentJoins.length > 0 && (
                <p className="small rm-vp-joins">
                  Just joined: {viewerData.recentJoins.slice(0, 3).map((join) => join.name).join(", ")}
                </p>
              )}
              {!viewerData ? <p className="muted small">Loading viewers...</p> : viewerData.viewers.length === 0 ? (
                <p className="muted small">No listeners in the room yet.</p>
              ) : (
                <ol className="rm-vp-list">
                  {viewerData.viewers.map((viewer) => (
                    <li key={`${viewer.name}-${viewer.joinedAt}`}>
                      <span className={`rm-vp-rank ${viewer.rank && viewer.rank <= 3 ? `top${viewer.rank}` : ""}`}>{viewer.rank ?? "–"}</span>
                      <ChatAvatar name={viewer.name} version={avatarVersion} />
                      <span className="rm-vp-name">{viewer.name}</span>
                      <span className="rm-vp-spent" title={`${viewer.tipCount} tips`}>
                        {viewer.spentCents > 0 ? `$${(viewer.spentCents / 100).toLocaleString(undefined, { minimumFractionDigits: viewer.spentCents % 100 ? 2 : 0 })}` : "$0"}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          <ChatLog messages={messages} hostProfile={hostProfile} avatarVersion={avatarVersion} />
          <form className="rm-chat-form" onSubmit={sendChat}>
            <label className="rm-sr" htmlFor="chat">Message as {displayName}</label>
            <input id="chat" name="chat" maxLength={500} placeholder={`Chat as ${displayName}...`} required />
            <button className="rm-send" type="submit" aria-label="Send message">➤</button>
          </form>
          <p className="small rm-notice" role="status">{notice}</p>
        </aside>
      </div>
      <footer className="footer">Private previews · Please do not redistribute unreleased music.</footer>
    </main>
  );
}

const REACTIONS = [
  { id: "heart", label: "Love", symbol: "♥" },
  { id: "fire", label: "Fire", symbol: "🔥" },
  { id: "clap", label: "Clap", symbol: "👏" },
  { id: "laugh", label: "Laugh", symbol: "😂" },
  { id: "wow", label: "Wow", symbol: "😮" },
] as const;
