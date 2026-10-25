"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Room, Track } from "livekit-client";

type VideoStatus = "off" | "connecting" | "live" | "error";

// Connects to the room's live video session. The host can publish camera/screen;
// listeners only subscribe. Does nothing when LiveKit is not configured.
export function useRoomVideo(muted: boolean) {
  const roomRef = useRef<Room | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioBoxRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<Track | null>(null);
  const [status, setStatus] = useState<VideoStatus>("off");
  const [canPublish, setCanPublish] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    audioBoxRef.current?.querySelectorAll("audio").forEach((element) => { element.muted = muted; });
  }, [muted]);

  useEffect(() => {
    let cancelled = false;
    let room: Room | null = null;

    async function connect() {
      try {
        const response = await fetch("/api/rooms/video", { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json();
        if (!result.configured || cancelled) return;

        setStatus("connecting");
        const { Room, RoomEvent, Track } = await import("livekit-client");
        if (cancelled) return;
        room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        const refresh = () => {
          if (!room) return;
          let best: Track | null = null;
          const participants = [room.localParticipant, ...room.remoteParticipants.values()];
          for (const participant of participants) {
            for (const publication of participant.trackPublications.values()) {
              if (publication.kind !== Track.Kind.Video || !publication.track || publication.isMuted) continue;
              if (!best || publication.source === Track.Source.ScreenShare) best = publication.track;
            }
          }
          const element = videoRef.current;
          if (currentRef.current && currentRef.current !== best && element) currentRef.current.detach(element);
          if (best && element && currentRef.current !== best) best.attach(element);
          currentRef.current = best;
          setHasVideo(Boolean(best));
          setCameraOn(room.localParticipant.isCameraEnabled);
          setScreenOn(room.localParticipant.isScreenShareEnabled);
        };

        room
          .on(RoomEvent.TrackSubscribed, (track) => {
            if (track.kind === Track.Kind.Audio && audioBoxRef.current) {
              const element = track.attach() as HTMLAudioElement;
              element.muted = muted;
              audioBoxRef.current.appendChild(element);
            }
            refresh();
          })
          .on(RoomEvent.TrackUnsubscribed, (track) => {
            track.detach().forEach((element) => element.remove());
            refresh();
          })
          .on(RoomEvent.LocalTrackPublished, refresh)
          .on(RoomEvent.LocalTrackUnpublished, refresh)
          .on(RoomEvent.TrackMuted, refresh)
          .on(RoomEvent.TrackUnmuted, refresh)
          .on(RoomEvent.Disconnected, () => { if (!cancelled) { setStatus("off"); setHasVideo(false); } });

        await room.connect(result.url, result.token);
        if (cancelled) { void room.disconnect(); return; }
        setCanPublish(Boolean(result.canPublish));
        setStatus("live");
        refresh();
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void connect();
    return () => {
      cancelled = true;
      roomRef.current = null;
      void room?.disconnect();
    };
    // Connect once per mount; mute changes are applied by the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    setError("");
    try {
      const next = !room.localParticipant.isCameraEnabled;
      await room.localParticipant.setCameraEnabled(next);
      await room.localParticipant.setMicrophoneEnabled(next);
    } catch {
      setError("Could not start the camera. Check your browser permissions.");
    }
  }, []);

  const toggleScreen = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    setError("");
    try {
      await room.localParticipant.setScreenShareEnabled(!room.localParticipant.isScreenShareEnabled, { audio: true });
    } catch {
      setError("Could not share your screen. Check your browser permissions.");
    }
  }, []);

  return { videoRef, audioBoxRef, status, canPublish, hasVideo, cameraOn, screenOn, error, toggleCamera, toggleScreen };
}
