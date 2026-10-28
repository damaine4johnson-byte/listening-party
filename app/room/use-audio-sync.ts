"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomState, RoomTrack } from "./room-types";

type UseAudioSyncInput = {
  state: RoomState | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  clockOffset: React.MutableRefObject<number>;
  onNotice: (message: string) => void;
};

const DRIFT_HARD = 1.2;
const DRIFT_SOFT = 0.25;

// Keeps the local audio element locked to the server's authoritative playback position.
export function useAudioSync({ state, audioRef, clockOffset, onNotice }: UseAudioSyncInput) {
  const yielded = useRef(false);
  const [synced, setSynced] = useState(true);
  const [audioPaused, setAudioPaused] = useState(true);
  const tabChannel = useRef<BroadcastChannel | null>(null);
  const tabId = useRef(Math.random().toString(36).slice(2));

  const expectedPosition = useCallback(() => {
    if (!state) return 0;
    return state.position_seconds + (
      state.status === "playing" && state.started_at
        ? Math.max(0, (Date.now() + clockOffset.current - new Date(state.started_at).getTime()) / 1000)
        : 0
    );
  }, [state, clockOffset]);

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
    if (hard || Math.abs(drift) > DRIFT_HARD) {
      audio.currentTime = expectedPosition();
      audio.playbackRate = 1;
    } else if (Math.abs(drift) > DRIFT_SOFT) {
      // Small drift is corrected by gently speeding up or slowing down, which is inaudible.
      audio.playbackRate = drift > 0 ? 0.97 : 1.03;
    } else {
      audio.playbackRate = 1;
    }
    setSynced(Math.abs(drift) < DRIFT_HARD);
    if (audio.paused && !yielded.current) void audio.play().catch(() => onNotice("Tap Play to start audio in this browser."));
  }, [state, expectedPosition, audioRef, onNotice]);

  useEffect(() => {
    syncAudio();
    const timer = window.setInterval(() => syncAudio(), 1000);
    return () => window.clearInterval(timer);
  }, [syncAudio]);

  useEffect(() => {
    // Two open tabs of this room would play the same song twice, so the tab that starts last wins.
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("fi-room-audio");
    tabChannel.current = channel;
    channel.onmessage = (event) => {
      if (event.data !== tabId.current) { yielded.current = true; audioRef.current?.pause(); }
    };
    return () => { channel.close(); tabChannel.current = null; };
  }, [audioRef]);

  const onAudioPlay = () => {
    yielded.current = false;
    setAudioPaused(false);
    tabChannel.current?.postMessage(tabId.current);
  };
  const onAudioPause = () => setAudioPaused(true);

  return { syncAudio, synced, audioPaused, expectedPosition, clockOffset, onAudioPlay, onAudioPause };
}
