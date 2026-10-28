"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { ChatMessage, HostProfile, HouseAd, Reaction, RoomState, RoomTrack, TipAlert } from "./room-types";

const URL_STAMP_TTL = 40 * 60_000;

export type RoomSessionPoll = {
  roomTitle: string;
  coverUrl: string | null;
  roomDescription: string;
  hostProfile: HostProfile | null;
  showAds: boolean;
  houseAd: HouseAd | null;
  isHost: boolean;
  inviteCode: string | null;
  viewerCount: number | null;
  state: RoomState | null;
  messages: ChatMessage[];
  reactions: Reaction[];
  tipAlerts: TipAlert[];
};

const INITIAL: RoomSessionPoll = {
  roomTitle: "Listening room",
  coverUrl: null,
  roomDescription: "",
  hostProfile: null,
  showAds: false,
  houseAd: null,
  isHost: false,
  inviteCode: null,
  viewerCount: null,
  state: null,
  messages: [],
  reactions: [],
  tipAlerts: [],
};

// Polls the room session endpoint every two seconds and merges new tip alerts.
export function useRoomSession(onEnded: () => void, onNotice: (message: string) => void) {
  const [data, setData] = useState<RoomSessionPoll>(INITIAL);
  const [ended, setEnded] = useState(false);
  const lastCommandAt = useRef(0);
  const seenTips = useRef<Set<string> | null>(null);
  const clockOffset = useRef(0);

  const endSession = () => {
    setEnded((current) => {
      if (!current) onEnded();
      return true;
    });
  };

  useEffect(() => {
    let active = true;
    let timer: number | undefined;

    async function refreshRoom() {
      try {
        const response = await fetch("/api/rooms/session", { cache: "no-store" });
        const result = await response.json();
        if (response.status === 410) {
          if (active) { active = false; endSession(); }
          return;
        }
        if (!response.ok) {
          if (active) onNotice(result.error || "Could not load room data.");
        } else if (active) {
          if (typeof result.serverTime === "number") clockOffset.current = result.serverTime - Date.now();
          const next = result.state as RoomState | null;
          // A fresh local command wins over a poll that may have been read before it landed.
          const state = next;
          setData((current) => {
            const unchanged = current.state && next && current.state.track_id === next.track_id &&
              current.state.status === next.status && current.state.started_at === next.started_at &&
              current.state.position_seconds === next.position_seconds;
            return {
              ...current,
              roomTitle: result.room.title,
              coverUrl: result.room.coverUrl ?? null,
              roomDescription: result.room.description ?? "",
              hostProfile: result.hostProfile,
              showAds: Boolean(result.showAds),
              houseAd: result.ad ?? null,
              isHost: Boolean(result.isHost),
              inviteCode: typeof result.inviteCode === "string" ? result.inviteCode : null,
              viewerCount: typeof result.viewerCount === "number" ? result.viewerCount : current.viewerCount,
              state: Date.now() - lastCommandAt.current > 2500 && !unchanged ? next : current.state ?? next,
              messages: result.messages,
              reactions: result.reactions ?? [],
            };
          });
          if (Array.isArray(result.tipAlerts)) {
            const incoming = result.tipAlerts as TipAlert[];
            // Tips already paid when the page loads are marked seen so only new ones pop.
            if (seenTips.current === null) {
              seenTips.current = new Set(incoming.map((tip) => tip.id));
            } else {
              const seen = seenTips.current;
              const fresh = incoming.filter((tip) => !seen.has(tip.id));
              if (fresh.length > 0) {
                fresh.forEach((tip) => seen.add(tip.id));
                setData((current) => ({ ...current, tipAlerts: [...current.tipAlerts, ...fresh].slice(-3) }));
                const ids = new Set(fresh.map((tip) => tip.id));
                window.setTimeout(() => setData((current) => ({ ...current, tipAlerts: current.tipAlerts.filter((tip) => !ids.has(tip.id)) })), 7000);
              }
            }
          }
          onNotice("Connected to the listening room.");
        }
      } catch {
        if (active) onNotice("Room service is unavailable. Try again shortly.");
      } finally {
        if (active) timer = window.setTimeout(refreshRoom, 2000);
      }
    }

    void refreshRoom();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Returns the signed-in listener's Supabase access token, or null when signed out.
  async function getAccessToken() {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    return error ? null : data.session?.access_token ?? null;
  }

  // Fetches the listener coin wallet once on mount.
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [coinSignedIn, setCoinSignedIn] = useState(false);
  useEffect(() => {
    let active = true;
    async function loadCoinBalance() {
      const accessToken = await getAccessToken();
      if (!active) return;
      setCoinSignedIn(Boolean(accessToken));
      if (!accessToken) {
        setCoinBalance(null);
        return;
      }
      const response = await fetch("/api/coins/balance", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const result = await response.json();
      if (active && response.ok && typeof result.balance === "number") setCoinBalance(result.balance);
    }
    void loadCoinBalance().catch(() => {
      if (active) setCoinBalance(null);
    });
    return () => { active = false; };
  }, []);

  // Refreshes the coin wallet balance after a tip.
  const refreshCoinBalance = async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    const response = await fetch("/api/coins/balance", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const result = await response.json();
    if (response.ok && typeof result.balance === "number") setCoinBalance(result.balance);
  };

  return {
    ...data,
    ended,
    endSession,
    coinBalance,
    coinSignedIn,
    refreshCoinBalance,
    lastCommandAt,
    clockOffset,
    setState: (updater: (current: RoomState | null) => RoomState | null) => setData((current) => ({ ...current, state: updater(current.state) })),
    appendMessage: (message: ChatMessage) => setData((current) => ({ ...current, messages: [...current.messages, message].slice(-100) })),
    appendReaction: (reaction: Reaction) => setData((current) => ({ ...current, reactions: [...current.reactions, reaction].slice(-50) })),
  };
}

// Polls the room's track list and keeps stable signed URLs for 40 minutes.
export function useRoomTracks() {
  const [tracks, setTracks] = useState<RoomTrack[]>([]);
  const urlStamps = useRef<Map<string, { url: string; at: number }>>(new Map());

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
            if (known && now - known.at < URL_STAMP_TTL) return { ...track, url: known.url };
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
      } catch { /* the next poll retries */ }
    }
    void loadTracks();
    const refreshTimer = window.setInterval(() => {
      // Hidden tabs keep polling but 5x slower, saving battery and signed-URL traffic.
      if (document.visibilityState === "visible") void loadTracks();
    }, 5_000);
    const onVisibilityChange = () => {
      // Poll immediately when the tab becomes visible again so the UI is current.
      if (document.visibilityState === "visible") void loadTracks();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return { tracks, setTracks, clearUrlStamps: () => urlStamps.current.clear() };
}
