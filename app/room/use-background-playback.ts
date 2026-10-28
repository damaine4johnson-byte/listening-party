"use client";

import { useEffect } from "react";

type Input = {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  title: string;
  artist: string;
  artworkUrl: string | null;
  active: boolean;
  playing: boolean;
  isHost: boolean;
  onResume: () => void;
};

// Keeps the room playing when the listener switches apps or locks the screen: publishes
// lock-screen / notification controls (Media Session) and re-syncs when the page returns.
export function useBackgroundPlayback({ audioRef, title, artist, artworkUrl, active, playing, isHost, onResume }: Input) {
  useEffect(() => {
    if (!("mediaSession" in navigator) || !active) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: "Famous Introvert Listening Rooms",
      artwork: artworkUrl ? [{ src: artworkUrl, sizes: "512x512" }] : [],
    });
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [title, artist, artworkUrl, active, playing]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    // Listeners can pause locally; the host's room controls stay in the page.
    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ["play", () => { if (!isHost) void audioRef.current?.play(); onResume(); }],
      ["pause", () => { if (!isHost) audioRef.current?.pause(); }],
    ];
    for (const [action, handler] of handlers) {
      try { session.setActionHandler(action, handler); } catch { /* unsupported action */ }
    }
    return () => {
      for (const [action] of handlers) {
        try { session.setActionHandler(action, null); } catch { /* unsupported action */ }
      }
    };
  }, [audioRef, isHost, onResume]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") onResume();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [onResume]);
}
