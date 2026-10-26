import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { api, responseError } from "../api";
import { colors, styles } from "../theme";

type Track = { id: string; title: string; durationSeconds: number | null; trackOrder: number; url: string };
type RoomSnapshot = {
  room: { title: string; description: string; status: string };
  state: { track_id: string | null; status: "playing" | "paused"; position_seconds: number; started_at: string | null } | null;
  messages: { id: string; display_name: string; body: string; created_at: string }[];
  reactions: { id: string; display_name: string; reaction: string; created_at: string }[];
  isHost: boolean;
  viewerCount: number;
};

function NativePlayer({ track, snapshot }: { track: Track | null; snapshot: RoomSnapshot | null }) {
  const player = useAudioPlayer(track ? { uri: track.url } : null);
  const status = useAudioPlayerStatus(player);
  const startedAt = snapshot?.state?.started_at;
  const serverPosition = snapshot?.state?.position_seconds ?? 0;
  const playbackStatus = snapshot?.state?.status;
  const trackId = track?.id;

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    });
  }, []);

  useEffect(() => {
    if (!trackId || !playbackStatus) {
      player.pause();
      return;
    }
    if (playbackStatus === "paused") {
      player.pause();
      return;
    }
    const expected = serverPosition + (startedAt ? Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 1000) : 0);
    if (Number.isFinite(status.currentTime) && Math.abs(status.currentTime - expected) > 2.5) {
      player.seekTo(Math.max(0, expected));
    }
    player.play();
  }, [player, trackId, playbackStatus, serverPosition, startedAt, status.currentTime]);

  return null;
}

type Props = {
  roomToken: string;
  accessToken: string | null;
  hostToken: string | null;
  onLeave: () => void;
};

export default function RoomScreen({ roomToken, accessToken, hostToken, onLeave }: Props) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const activeTrack = useMemo(() => tracks.find((track) => track.id === snapshot?.state?.track_id) ?? null, [tracks, snapshot]);

  const refresh = useCallback(async () => {
    const result = await api("/api/rooms/session", { roomToken, hostToken });
    if (!result.response.ok) throw new Error(responseError(result.data, "Could not load room."));
    setSnapshot(result.data as unknown as RoomSnapshot);
    const trackResult = await api("/api/rooms/tracks", { roomToken, hostToken });
    if (!trackResult.response.ok) throw new Error(responseError(trackResult.data, "Could not load tracks."));
    setTracks(Array.isArray(trackResult.data.tracks) ? trackResult.data.tracks as Track[] : []);
  }, [hostToken, roomToken]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        await refresh();
        if (active) setError("");
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Room connection was lost.");
      } finally {
        if (active) timer = setTimeout(() => void poll(), 2500);
      }
    }
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);

  async function sendMessage() {
    const message = body.trim();
    if (!message) return;
    setPending(true);
    setError("");
    try {
      const result = await api("/api/rooms/chat", { method: "POST", body: { body: message }, roomToken });
      if (!result.response.ok) throw new Error(responseError(result.data, "Could not send message."));
      setBody("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chat is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  async function react(reaction: string) {
    try {
      const result = await api("/api/rooms/reactions", { method: "POST", body: { reaction }, roomToken });
      if (!result.response.ok) throw new Error(responseError(result.data, "Could not send reaction."));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reaction could not be sent.");
    }
  }

  async function selectTrack(trackId: string | null) {
    if (!snapshot?.isHost || !hostToken) return;
    setPending(true);
    setError("");
    try {
      const result = await api("/api/rooms/playback", {
        method: "POST",
        body: { status: "playing", trackId, positionSeconds: 0 },
        hostToken,
        roomToken,
      });
      if (!result.response.ok) throw new Error(responseError(result.data, "Playback command failed."));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Playback service is unavailable.");
    } finally {
      setPending(false);
    }
  }

  async function togglePlayback() {
    if (!snapshot?.isHost || !snapshot.state) return;
    const resultStatus = snapshot.state.status === "playing" ? "paused" : "playing";
    const position = snapshot.state.position_seconds + (
      snapshot.state.status === "playing" && snapshot.state.started_at
        ? Math.max(0, (Date.now() - new Date(snapshot.state.started_at).getTime()) / 1000)
        : 0
    );
    setPending(true);
    try {
      const result = await api("/api/rooms/playback", {
        method: "POST",
        body: { status: resultStatus, trackId: snapshot.state.track_id, positionSeconds: position },
        hostToken,
        roomToken,
      });
      if (!result.response.ok) throw new Error(responseError(result.data, "Playback command failed."));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Playback service is unavailable.");
    } finally {
      setPending(false);
    }
  }

  async function boost(track: Track, coins: number) {
    if (!accessToken) {
      setError("Sign in to your listener wallet before tipping with coins.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await api("/api/coins/tip", {
        method: "POST",
        body: { trackId: track.id, coins },
        accessToken,
        roomToken,
      });
      if (!result.response.ok) throw new Error(responseError(result.data, "Could not tip with coins."));
      setNotice(`${coins} coins sent. The track is moving up the queue.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Coin tip failed.");
    } finally {
      setPending(false);
    }
  }

  if (!snapshot) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.muted}>Connecting to your room...</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={onLeave}><Text style={styles.body}>Leave room</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={styles.row}>
        <Pressable onPress={onLeave}><Text style={styles.body}>‹ Leave</Text></Pressable>
        <Text style={[styles.eyebrow, { marginLeft: "auto" }]}>{snapshot.viewerCount} LISTENING</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>{snapshot.isHost ? "HOSTING LIVE" : "LISTENING ROOM"}</Text>
        <Text style={styles.title}>{snapshot.room.title}</Text>
        {snapshot.room.description ? <Text style={styles.muted}>{snapshot.room.description}</Text> : null}
        <Text style={[styles.body, { marginTop: 12 }]}>{activeTrack?.title ?? "Waiting for the host to start a track"}</Text>
        <Text style={styles.muted}>{snapshot.state?.status === "playing" ? "NOW PLAYING" : "PAUSED"}</Text>
        <NativePlayer key={activeTrack?.id ?? "empty"} track={activeTrack} snapshot={snapshot} />
        {snapshot.isHost && (
          <View style={styles.row}>
            <Pressable style={[styles.button, styles.buttonSecondary, { flex: 1 }]} disabled={pending || !snapshot.state} onPress={() => void togglePlayback()}>
              <Text style={styles.buttonText}>{snapshot.state?.status === "playing" ? "Pause" : "Play"}</Text>
            </Pressable>
            {tracks.length > 0 && (
              <Pressable style={[styles.button, { flex: 1 }]} disabled={pending} onPress={() => void selectTrack(tracks[0].id)}>
                <Text style={styles.buttonText}>Play first</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>PLAYLIST</Text>
        {tracks.length === 0 ? <Text style={styles.muted}>The host has not added tracks yet.</Text> : tracks.map((track, index) => (
          <View key={track.id} style={[styles.row, { justifyContent: "space-between" }]}>
            <Text style={[styles.body, { flex: 1 }]}>{index + 1}. {track.title}</Text>
            {snapshot.isHost ? (
              <Pressable onPress={() => void selectTrack(track.id)}><Text style={{ color: colors.gold, fontWeight: "800" }}>PLAY</Text></Pressable>
            ) : track.id !== snapshot.state?.track_id ? (
              <View style={styles.row}>
                {[30, 50, 100].map((coins) => (
                  <Pressable key={coins} disabled={pending} onPress={() => void boost(track, coins)}>
                    <Text style={{ color: colors.gold, fontWeight: "800" }}>{coins}c</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>REACTIONS</Text>
        <View style={styles.row}>
          {["heart", "fire", "clap", "laugh", "wow"].map((reaction) => (
            <Pressable key={reaction} style={[styles.button, styles.buttonSecondary]} onPress={() => void react(reaction)}>
              <Text style={styles.buttonText}>{({ heart: "♥", fire: "🔥", clap: "👏", laugh: "😂", wow: "😮" } as Record<string, string>)[reaction]}</Text>
            </Pressable>
          ))}
        </View>
        {snapshot.reactions.slice(-4).map((item) => <Text key={item.id} style={styles.muted}>{item.display_name} · {item.reaction}</Text>)}
      </View>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>ROOM CHAT</Text>
        {snapshot.messages.slice(-20).map((message) => (
          <Text key={message.id} style={styles.body}><Text style={{ color: colors.gold, fontWeight: "700" }}>{message.display_name}: </Text>{message.body}</Text>
        ))}
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={body}
            onChangeText={setBody}
            placeholder="Say something..."
            placeholderTextColor={colors.muted}
            maxLength={500}
            onSubmitEditing={() => void sendMessage()}
          />
          <Pressable style={styles.button} disabled={pending || !body.trim()} onPress={() => void sendMessage()}>
            <Text style={styles.buttonText}>Send</Text>
          </Pressable>
        </View>
      </View>
      {notice ? <Text style={styles.success}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}
