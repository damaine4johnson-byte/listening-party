import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Share, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import type { GoogleLoginResult } from "../auth-types";
import { api, responseError } from "../api";
import { supabase } from "../supabase";
import { colors, styles } from "../theme";

type Room = { id: string; title: string; description: string; status: string; entry_fee_cents: number; slug: string };
type Track = { id: string; title: string; duration_seconds: number | null; track_order: number };

type Props = {
  hostToken: string | null;
  accessToken: string | null;
  onSaveHostToken: (token: string | null) => Promise<void>;
  onSignInGoogle: () => Promise<GoogleLoginResult>;
  onBack: () => void;
  onSignOut: () => void;
  onEnterRoom: (token: string) => void;
};

export default function HostScreen(props: Props) {
  const [screen, setScreen] = useState<"dashboard" | "profile" | "analytics" | "room">("dashboard");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const loadRooms = useCallback(async () => {
    if (!props.hostToken) return;
    const result = await api("/api/host/rooms", { hostToken: props.hostToken });
    if (!result.response.ok) throw new Error(responseError(result.data, "Could not load your rooms."));
    setRooms(Array.isArray(result.data.rooms) ? result.data.rooms as Room[] : []);
  }, [props.hostToken]);

  useEffect(() => {
    if (!props.hostToken) return;
    void loadRooms().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load host dashboard."));
  }, [loadRooms, props.hostToken]);

  async function passwordSignIn() {
    setPending(true);
    setError("");
    try {
      const result = await api("/api/host/session", {
        method: "POST",
        body: { username, password },
        mobile: true,
      });
      if (!result.response.ok || typeof result.data.hostSessionToken !== "string") {
        throw new Error(responseError(result.data, "Host sign-in failed."));
      }
      await props.onSaveHostToken(result.data.hostSessionToken);
      setNotice("Host studio unlocked.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Host sign-in failed.");
    } finally {
      setPending(false);
    }
  }

  async function googleSignIn() {
    setPending(true);
    setError("");
    try {
      const auth = await props.onSignInGoogle();
      const result = await api("/api/host/google-session", {
        method: "POST",
        body: { accessToken: auth.session.access_token },
        mobile: true,
      });
      if (!result.response.ok || typeof result.data.hostSessionToken !== "string") {
        throw new Error(responseError(result.data, "This Google account does not have host access."));
      }
      await props.onSaveHostToken(result.data.hostSessionToken);
      setNotice("Host studio unlocked.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google host sign-in failed.");
    } finally {
      setPending(false);
    }
  }

  async function createRoom() {
    if (!props.hostToken) return;
    setPending(true);
    setError("");
    try {
      const dollars = Number(entryFee || 0);
      const result = await api("/api/host/rooms", {
        method: "POST",
        hostToken: props.hostToken,
        body: {
          title,
          description,
          entryFeeCents: Math.round(dollars * 100),
        },
      });
      if (!result.response.ok) throw new Error(responseError(result.data, "Room could not be created."));
      const code = typeof result.data.inviteCode === "string" ? result.data.inviteCode : "";
      const room = result.data.room as Room;
      setInviteCode(code);
      setSelectedRoom(room);
      setTitle("");
      setDescription("");
      setEntryFee("");
      await loadRooms();
      if (code) await Share.share({ message: `Your private listening room invite code: ${code}` });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Room could not be created.");
    } finally {
      setPending(false);
    }
  }

  async function saveProfile(values: Record<string, unknown>) {
    if (!props.hostToken) return;
    const result = await api("/api/host/profile", { method: "PUT", hostToken: props.hostToken, body: values });
    if (!result.response.ok) throw new Error(responseError(result.data, "Could not save artist profile."));
    setNotice("Artist profile saved.");
  }

  if (!props.hostToken) {
    return (
      <View style={{ gap: 16 }}>
        <Pressable onPress={props.onBack}><Text style={styles.body}>‹ Back</Text></Pressable>
        <Text style={styles.eyebrow}>ARTIST STUDIO</Text>
        <Text style={styles.title}>Bring the room to life.</Text>
        <View style={styles.card}>
          <Text style={styles.body}>Sign in with your host Google account or the configured studio password.</Text>
          <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="Studio username" placeholderTextColor={colors.muted} autoCapitalize="none" />
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Studio password" placeholderTextColor={colors.muted} secureTextEntry />
          <Pressable style={styles.button} disabled={pending} onPress={() => void passwordSignIn()}>
            <Text style={styles.buttonText}>{pending ? "Signing in..." : "Sign in to host studio"}</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.buttonSecondary]} disabled={pending} onPress={() => void googleSignIn()}>
            <Text style={styles.buttonText}>Continue with Google</Text>
          </Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={styles.row}>
        <Pressable onPress={() => screen === "dashboard" ? props.onBack() : setScreen("dashboard")}>
          <Text style={styles.body}>‹ {screen === "dashboard" ? "Back" : "Studio"}</Text>
        </Pressable>
        <Pressable style={{ marginLeft: "auto" }} onPress={props.onSignOut}><Text style={styles.muted}>Sign out</Text></Pressable>
      </View>
      {screen === "dashboard" && !selectedRoom && (
        <>
          <Text style={styles.eyebrow}>ARTIST STUDIO</Text>
          <Text style={styles.title}>Your rooms.</Text>
          <View style={styles.row}>
            <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => setScreen("profile")}><Text style={styles.buttonText}>Profile & payouts</Text></Pressable>
            <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => setScreen("analytics")}><Text style={styles.buttonText}>Analytics</Text></Pressable>
          </View>
          <View style={styles.card}>
            <Text style={styles.eyebrow}>CREATE A ROOM</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Room title" placeholderTextColor={colors.muted} maxLength={100} />
            <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Description (optional)" placeholderTextColor={colors.muted} maxLength={500} />
            <TextInput style={styles.input} value={entryFee} onChangeText={setEntryFee} placeholder="Entry price in USD (0 = free)" placeholderTextColor={colors.muted} keyboardType="decimal-pad" />
            <Pressable style={styles.button} disabled={pending || !title.trim()} onPress={() => void createRoom()}>
              <Text style={styles.buttonText}>{pending ? "Creating..." : "Create private room"}</Text>
            </Pressable>
            {inviteCode ? <Text style={styles.success}>Invite code: {inviteCode}</Text> : null}
          </View>
          <View style={styles.card}>
            <Text style={styles.eyebrow}>YOUR ROOMS</Text>
            {rooms.length === 0 ? <Text style={styles.muted}>Create your first room above.</Text> : rooms.map((room) => (
              <Pressable key={room.id} style={[styles.card, { padding: 12 }]} onPress={() => { setSelectedRoom(room); setScreen("room"); }}>
                <Text style={styles.body}>{room.title}</Text>
                <Text style={styles.muted}>{room.status} · {room.entry_fee_cents ? `$${(room.entry_fee_cents / 100).toFixed(2)}` : "Free"}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      {screen === "profile" && <ProfileSettings hostToken={props.hostToken} onSave={saveProfile} />}
      {screen === "analytics" && <HostAnalytics hostToken={props.hostToken} />}
      {screen === "room" && selectedRoom && (
        <ManageRoom
          room={selectedRoom}
          hostToken={props.hostToken}
          onEnter={props.onEnterRoom}
          onUpdate={(updated) => { setSelectedRoom(updated); void loadRooms(); }}
        />
      )}
      {notice ? <Text style={styles.success}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function ProfileSettings({ hostToken, onSave }: { hostToken: string; onSave: (values: Record<string, unknown>) => Promise<void> }) {
  const [values, setValues] = useState({ displayName: "", bio: "", avatarUrl: "", contactEmail: "", planTier: "free" });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    void api("/api/host/profile", { hostToken }).then(({ response, data }) => {
      if (!response.ok) throw new Error(responseError(data, "Could not load profile."));
      const profile = data.profile as Record<string, unknown>;
      setValues({
        displayName: String(profile.display_name ?? ""),
        bio: String(profile.bio ?? ""),
        avatarUrl: String(profile.avatar_url ?? ""),
        contactEmail: String(profile.contact_email ?? ""),
        planTier: String(profile.plan_tier ?? "free"),
      });
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load profile."));
  }, [hostToken]);
  function field(key: keyof typeof values, placeholder: string, multiline = false) {
    return (
      <TextInput
        style={[styles.input, multiline ? { minHeight: 86, textAlignVertical: "top" } : null]}
        value={values[key]}
        onChangeText={(value) => setValues((current) => ({ ...current, [key]: value }))}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        maxLength={key === "bio" ? 400 : 2048}
        autoCapitalize={key === "avatarUrl" || key === "contactEmail" ? "none" : "sentences"}
      />
    );
  }
  async function submit() {
    setPending(true);
    setError("");
    try {
      await onSave(values);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save profile.");
    } finally {
      setPending(false);
    }
  }
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>ARTIST PROFILE</Text>
      {field("displayName", "Display name")}
      {field("bio", "Artist bio", true)}
      {field("avatarUrl", "HTTPS avatar URL")}
      {field("contactEmail", "Contact email")}
      <Pressable style={styles.button} disabled={pending} onPress={() => void submit()}><Text style={styles.buttonText}>{pending ? "Saving..." : "Save profile"}</Text></Pressable>
      {saved ? <Text style={styles.success}>Profile saved.</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PayoutSettings hostToken={hostToken} />
    </View>
  );
}

function PayoutSettings({ hostToken }: { hostToken: string }) {
  const [email, setEmail] = useState("");
  const [balance, setBalance] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    void api("/api/host/payouts", { hostToken }).then(({ response, data }) => {
      if (!response.ok) throw new Error(responseError(data, "Could not load payout settings."));
      setEmail(typeof data.paypalEmail === "string" ? data.paypalEmail : "");
      setBalance(typeof data.pendingCents === "number" ? `$${(data.pendingCents / 100).toFixed(2)}` : "");
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load payout settings."));
  }, [hostToken]);
  async function save() {
    setError("");
    const result = await api("/api/host/payouts", { method: "POST", body: { paypalEmail: email }, hostToken });
    if (!result.response.ok) setError(responseError(result.data, "Could not save PayPal email."));
    else setNotice("PayPal email saved.");
  }
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.eyebrow}>PAYPAL PAYOUTS</Text>
      <Text style={styles.muted}>Unpaid earnings: {balance || "—"}</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="PayPal email" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" />
      <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => void save()}><Text style={styles.buttonText}>Save PayPal email</Text></Pressable>
      {notice ? <Text style={styles.success}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function HostAnalytics({ hostToken }: { hostToken: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void api("/api/host/analytics", { hostToken }).then(({ response, data: result }) => {
      if (!response.ok) throw new Error(responseError(result, "Could not load analytics."));
      setData(result);
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load analytics."));
  }, [hostToken]);
  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!data) return <ActivityIndicator color={colors.accent} />;
  const totals = data.totals && typeof data.totals === "object" ? data.totals as Record<string, number> : {};
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>LAST 7 DAYS</Text>
      <Text style={styles.body}>Listeners: {totals.listeners ?? 0}</Text>
      <Text style={styles.body}>Here now: {totals.hereNow ?? 0}</Text>
      <Text style={styles.body}>Tips: ${((totals.tipCents ?? 0) / 100).toFixed(2)}</Text>
      <Text style={styles.body}>Entries: ${((totals.entryCents ?? 0) / 100).toFixed(2)}</Text>
      <Text style={styles.muted}>Analytics refresh when you reopen this view.</Text>
    </View>
  );
}

function ManageRoom({ room, hostToken, onEnter, onUpdate }: {
  room: Room; hostToken: string;
  onEnter: (token: string) => void; onUpdate: (room: Room) => void;
}) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    void api(`/api/host/rooms/tracks?roomId=${encodeURIComponent(room.id)}`, { hostToken })
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(responseError(data, "Could not load playlist."));
        setTracks(Array.isArray(data.tracks) ? data.tracks as Track[] : []);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load playlist."));
  }, [hostToken, room.id]);

  async function setStatus(status: string) {
    const result = await api("/api/host/rooms", { method: "PATCH", hostToken, body: { roomId: room.id, status } });
    if (!result.response.ok) throw new Error(responseError(result.data, "Could not update room."));
    onUpdate({ ...room, status });
  }

  async function enterRoom() {
    setPending(true);
    try {
      const joined = await api("/api/host/rooms/enter", {
        method: "POST",
        hostToken,
        mobile: true,
        body: { roomId: room.id },
      });
      if (!joined.response.ok || typeof joined.data.roomSessionToken !== "string") {
        throw new Error(responseError(joined.data, "Could not enter the room."));
      }
      onEnter(joined.data.roomSessionToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not enter the room.");
    } finally {
      setPending(false);
    }
  }

  async function uploadTrack() {
    const selection = await DocumentPicker.getDocumentAsync({
      // Explicit types: iOS greys out mp3/wav in the Files picker when only audio/* is given.
      type: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/flac", "audio/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (selection.canceled || !selection.assets[0]) return;
    const asset = selection.assets[0];
    if (!asset.mimeType || !asset.size) {
      setError("Could not read the audio file details.");
      return;
    }
    if (!supabase) {
      setError("Supabase storage is not configured in this app.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const signed = await api("/api/host/rooms/tracks/upload-url", {
        method: "POST",
        hostToken,
        body: { roomId: room.id, fileName: asset.name, contentType: asset.mimeType, fileSize: asset.size },
      });
      if (!signed.response.ok || typeof signed.data.path !== "string" || typeof signed.data.token !== "string") {
        throw new Error(responseError(signed.data, "Could not prepare audio upload."));
      }
      const file = await fetch(asset.uri);
      const blob = await file.blob();
      const upload = await supabase.storage.from("tracks").uploadToSignedUrl(
        signed.data.path,
        signed.data.token,
        blob,
        { contentType: asset.mimeType },
      );
      if (upload.error) throw new Error("Audio upload failed.");
      const added = await api("/api/host/rooms/tracks", {
        method: "POST",
        hostToken,
        body: {
          roomId: room.id,
          title: asset.name.replace(/\.[^.]+$/, ""),
          path: signed.data.path,
        },
      });
      if (!added.response.ok) throw new Error(responseError(added.data, "Could not add track to playlist."));
      const refreshed = await api(`/api/host/rooms/tracks?roomId=${encodeURIComponent(room.id)}`, { hostToken });
      if (!refreshed.response.ok) throw new Error(responseError(refreshed.data, "Track was uploaded but playlist could not reload."));
      setTracks(Array.isArray(refreshed.data.tracks) ? refreshed.data.tracks as Track[] : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Audio upload failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>ROOM CONTROL</Text>
      <Text style={styles.title}>{room.title}</Text>
      <Text style={styles.muted}>{room.status} · {room.entry_fee_cents ? `$${(room.entry_fee_cents / 100).toFixed(2)}` : "Free entry"}</Text>
      <View style={styles.row}>
        <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => void setStatus(room.status === "live" ? "scheduled" : "live").catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not update room."))}>
          <Text style={styles.buttonText}>{room.status === "live" ? "Schedule" : "Go live"}</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => void setStatus("ended").catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not update room."))}>
          <Text style={styles.buttonText}>End room</Text>
        </Pressable>
      </View>
      <Pressable style={styles.button} disabled={pending} onPress={() => void enterRoom()}><Text style={styles.buttonText}>{pending ? "Opening room..." : "Enter as host"}</Text></Pressable>
      <View style={styles.divider} />
      <Text style={styles.eyebrow}>PLAYLIST · {tracks.length} TRACKS</Text>
      {tracks.map((track) => <Text key={track.id} style={styles.body}>{track.track_order + 1}. {track.title}</Text>)}
      <Pressable style={[styles.button, styles.buttonSecondary]} disabled={pending} onPress={() => void uploadTrack()}>
        <Text style={styles.buttonText}>{pending ? "Working..." : "Upload audio track"}</Text>
      </Pressable>
      <Text style={styles.muted}>Private audio files upload directly to your Supabase Storage bucket.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}
