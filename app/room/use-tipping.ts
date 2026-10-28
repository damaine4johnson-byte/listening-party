"use client";

import { useCallback, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { RoomTrack } from "./room-types";

type UseTippingInput = {
  onNotice: (message: string) => void;
  refreshCoinBalance: () => Promise<void>;
};

// Card tips redirect to WiPay checkout; coin tips spend the listener wallet inline.
export function useTipping({ onNotice, refreshCoinBalance }: UseTippingInput) {
  const [tipTrackId, setTipTrackId] = useState<string | null>(null);
  const [tipBusy, setTipBusy] = useState(false);

  const startTip = useCallback(async (track: RoomTrack, amountCents: number) => {
    setTipBusy(true);
    try {
      const response = await fetch("/api/rooms/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id, amountCents }),
      });
      const result = await response.json();
      if (!response.ok) {
        onNotice(result.error || "Could not start the tip.");
        return;
      }
      window.location.assign(result.url);
    } catch {
      onNotice("Tip service is temporarily unavailable.");
    } finally {
      setTipBusy(false);
    }
  }, [onNotice]);

  const startCoinTip = useCallback(async (track: RoomTrack, coins: number) => {
    setTipBusy(true);
    try {
      if (!supabase) {
        onNotice("Listener sign-in is not configured.");
        return;
      }
      const { data, error } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (error || !accessToken) {
        onNotice("Sign in to your listener wallet to tip with coins.");
        return;
      }
      const response = await fetch("/api/coins/tip", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ trackId: track.id, coins }),
      });
      const result = await response.json();
      if (!response.ok) {
        onNotice(result.error || "Could not tip with coins.");
        return;
      }
      onNotice(`${coins} coins sent. Your song moves up to play next.`);
      setTipTrackId(null);
      await refreshCoinBalance();
    } catch {
      onNotice("Coin wallet is temporarily unavailable.");
    } finally {
      setTipBusy(false);
    }
  }, [onNotice, refreshCoinBalance]);

  return { tipTrackId, setTipTrackId, tipBusy, startTip, startCoinTip };
}

// Reorders the host playlist with optimistic local state and rollback on failure.
export function usePlaylistReorder(onNotice: (message: string) => void) {
  const [reordering, setReordering] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const moveTrack = useCallback(async (
    roomId: string | undefined,
    tracks: RoomTrack[],
    setTracks: (next: RoomTrack[]) => void,
    from: number,
    to: number,
  ) => {
    if (!roomId || reordering || from === to || to < 0 || to >= tracks.length) return;
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
        body: JSON.stringify({ roomId, trackIds: reordered.map((track) => track.id) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not reorder playlist.");
      onNotice(`Moved ${moved.title}.`);
    } catch (error) {
      setTracks(previous);
      onNotice(error instanceof Error ? error.message : "Could not reorder playlist.");
    } finally {
      setReordering(false);
    }
  }, [reordering, onNotice]);

  return { reordering, dragIndex, setDragIndex, moveTrack };
}
