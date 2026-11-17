"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Track } from "livekit-client";
import type { Room } from "livekit-client";
import { getBroadcastSources, pauseBroadcast, resumeBroadcast } from "./broadcast-controls";
import type { BroadcastSources } from "./broadcast-controls";

type VideoStatus = "off" | "connecting" | "live" | "error";

// Connects to the room's live video session. The host can publish camera/screen;
// listeners only subscribe. Does nothing when LiveKit is not configured.
export function useRoomVideo(muted: boolean, micVolume: number) {
  const roomRef = useRef<Room | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioBoxRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<Track | null>(null);
  const mutedRef = useRef(muted);
  const micVolumeRef = useRef(micVolume);
  const broadcastSourcesRef = useRef<BroadcastSources | null>(null);
  const broadcastBusyRef = useRef(false);
  const stoppingRef = useRef(false);
  const operationRef = useRef<Promise<void> | null>(null);
  const finishOperationRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<VideoStatus>("off");
  const [canPublish, setCanPublish] = useState(false);
  const [serverReady, setServerReady] = useState<boolean | null>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [microphoneOn, setMicrophoneOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [broadcastState, setBroadcastState] = useState<"active" | "paused" | "incomplete">("active");
  const [broadcastBusy, setBroadcastBusy] = useState(false);
  const [broadcastNotice, setBroadcastNotice] = useState("");
  const [error, setError] = useState("");
  const [connectionNotice, setConnectionNotice] = useState("");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioError, setAudioError] = useState("");

  mutedRef.current = muted;
  micVolumeRef.current = micVolume;

  const beginOperation = useCallback(() => {
    if (broadcastBusyRef.current || stoppingRef.current) return false;
    broadcastBusyRef.current = true;
    operationRef.current = new Promise((resolve) => { finishOperationRef.current = resolve; });
    setBroadcastBusy(true);
    return true;
  }, []);

  const finishOperation = useCallback(() => {
    broadcastBusyRef.current = false;
    finishOperationRef.current?.();
    finishOperationRef.current = null;
    operationRef.current = null;
    setBroadcastBusy(false);
  }, []);

  useEffect(() => {
    audioBoxRef.current?.querySelectorAll("audio").forEach((element) => { element.muted = muted; });
  }, [muted]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    room.remoteParticipants.forEach((participant) => {
      participant.setVolume(muted ? 0 : micVolume, Track.Source.Microphone);
    });
  }, [micVolume, muted]);

  useEffect(() => {
    let cancelled = false;
    let room: Room | null = null;

    async function connect() {
      try {
        const response = await fetch("/api/rooms/video", { cache: "no-store" });
        if (!response.ok) throw new Error("Live broadcast connection could not be established.");
        const result = await response.json();
        if (!cancelled) setServerReady(Boolean(result.configured));
        if (!result.configured || cancelled) return;

        setStatus("connecting");
        const { Room, RoomEvent } = await import("livekit-client");
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
          setMicrophoneOn(room.localParticipant.isMicrophoneEnabled);
          setScreenOn(room.localParticipant.isScreenShareEnabled);
        };

        room
          .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if (publication.source === Track.Source.Microphone) {
              participant.setVolume(mutedRef.current ? 0 : micVolumeRef.current, Track.Source.Microphone);
            }
            if (track.kind === Track.Kind.Audio && audioBoxRef.current) {
              const element = track.attach() as HTMLAudioElement;
              element.muted = mutedRef.current;
              audioBoxRef.current.appendChild(element);
            }
            refresh();
          })
          .on(RoomEvent.TrackUnsubscribed, (track) => {
            if (track.kind === Track.Kind.Audio) {
              track.detach().forEach((element) => element.remove());
            } else {
              track.detach();
              if (currentRef.current === track) currentRef.current = null;
            }
            refresh();
          })
          .on(RoomEvent.TrackSubscriptionFailed, () => {
            if (!cancelled) setConnectionNotice("Could not receive a live audio or video track. Reload the room to retry.");
          })
          .on(RoomEvent.LocalTrackPublished, refresh)
          .on(RoomEvent.LocalTrackUnpublished, refresh)
          .on(RoomEvent.TrackMuted, refresh)
          .on(RoomEvent.TrackUnmuted, refresh)
          .on(RoomEvent.LocalAudioSilenceDetected, (publication) => {
            if (publication.source === Track.Source.Microphone && !broadcastSourcesRef.current) {
              setError("No sound detected from your microphone. Check its connection and input level.");
            }
          })
          .on(RoomEvent.AudioPlaybackStatusChanged, () => {
            if (!cancelled && room) {
              setAudioBlocked(!room.canPlaybackAudio);
              if (room.canPlaybackAudio) setAudioError("");
            }
          })
          .on(RoomEvent.Reconnecting, () => {
            if (!cancelled) {
              setStatus("connecting");
              setConnectionNotice("Live audio and video connection interrupted. Reconnecting...");
            }
          })
          .on(RoomEvent.Reconnected, () => {
            if (!cancelled) {
              setStatus("live");
              setConnectionNotice("");
              refresh();
            }
          })
          .on(RoomEvent.Disconnected, () => {
            if (!cancelled) {
              setStatus("off");
              setHasVideo(false);
              setConnectionNotice("Live audio and video disconnected. Reload the room to reconnect.");
            }
          });

        await room.connect(result.url, result.token);
        if (cancelled) { void room.disconnect(); return; }
        room.remoteParticipants.forEach((participant) => {
          participant.setVolume(mutedRef.current ? 0 : micVolumeRef.current, Track.Source.Microphone);
        });
        setCanPublish(Boolean(result.canPublish));
        setStatus("live");
        setAudioBlocked(!room.canPlaybackAudio);
        refresh();
      } catch {
        if (!cancelled) {
          setStatus("error");
          setConnectionNotice("Live audio and video could not connect. Reload the room to try again.");
        }
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

  const retryAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) {
      setAudioError("Live audio is disconnected. Reload the room to reconnect.");
      return;
    }
    setAudioError("");
    try {
      await room.startAudio();
      setAudioBlocked(!room.canPlaybackAudio);
      if (!room.canPlaybackAudio) setAudioError("Live audio is still blocked. Check your browser audio settings and try again.");
    } catch {
      setAudioBlocked(true);
      setAudioError("Could not start live audio. Check your browser audio settings and try again.");
    }
  }, []);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room || broadcastSourcesRef.current || !beginOperation()) return;
    setError("");
    try {
      const next = !room.localParticipant.isCameraEnabled;
      await room.localParticipant.setCameraEnabled(next);
    } catch {
      setError("Could not start the camera. Check your browser permissions.");
    } finally {
      finishOperation();
    }
  }, [beginOperation, finishOperation]);

  const toggleMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room || broadcastSourcesRef.current || !beginOperation()) return;
    setError("");
    try {
      await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);
    } catch {
      setError("Could not start the microphone. Check your browser microphone permission.");
    } finally {
      finishOperation();
    }
  }, [beginOperation, finishOperation]);

  const stopAll = useCallback(async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    stoppingRef.current = true;
    try {
      await operationRef.current;
      await pauseBroadcast(lp);
    } catch (reason) {
      const failed = reason instanceof Error ? reason.message : "broadcast sources";
      setError(`Could not stop ${failed}. Check your device and browser permissions.`);
    } finally {
      stoppingRef.current = false;
    }
  }, []);

  const toggleScreen = useCallback(async () => {
    const room = roomRef.current;
    if (!room || broadcastSourcesRef.current || !beginOperation()) return;
    setError("");
    try {
      await room.localParticipant.setScreenShareEnabled(!room.localParticipant.isScreenShareEnabled, { audio: true });
    } catch {
      setError("Could not share your screen. Check your browser permissions.");
    } finally {
      finishOperation();
    }
  }, [beginOperation, finishOperation]);

  const changeBroadcast = useCallback(async (action: "pause" | "resume") => {
    const room = roomRef.current;
    if (!room) return;
    if (action === "resume" && !broadcastSourcesRef.current) return;
    if (!beginOperation()) return;
    setError("");
    setBroadcastNotice("");
    const participant = room.localParticipant;
    const sources = broadcastSourcesRef.current ?? getBroadcastSources(participant);
    broadcastSourcesRef.current = sources;
    try {
      if (action === "pause") {
        await pauseBroadcast(participant);
        setBroadcastState("paused");
        setBroadcastNotice(sources.screen
          ? "Broadcast paused. Screen sharing stopped; start it again after resuming."
          : "Broadcast paused. Music continues playing.");
      } else {
        await resumeBroadcast(participant, sources);
        broadcastSourcesRef.current = null;
        setBroadcastState("active");
        setBroadcastNotice(sources.screen ? "Broadcast resumed. Start screen sharing again if needed." : "Broadcast resumed.");
      }
    } catch (reason) {
      setBroadcastState("incomplete");
      const failed = reason instanceof Error ? reason.message : "broadcast sources";
      setError(`Could not ${action} ${failed}. Some sources may still be live. Retry or resume the broadcast.`);
    } finally {
      finishOperation();
    }
  }, [beginOperation, finishOperation]);

  return { videoRef, audioBoxRef, status, serverReady, canPublish, hasVideo, cameraOn, microphoneOn, screenOn, broadcastState, broadcastBusy, broadcastNotice, connectionNotice, audioBlocked, audioError, error, retryAudio, toggleCamera, toggleMicrophone, toggleScreen, changeBroadcast, stopAll };
}
