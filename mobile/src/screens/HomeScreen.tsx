import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { User } from "@supabase/supabase-js";
import { api, responseError } from "../api";
import { colors, styles } from "../theme";

const ROOM_SESSION_KEY = "fi-mobile-room-session";

type Props = {
  accessToken: string | null;
  user: User | null;
  onOpenWallet: () => void;
  onOpenHost: () => void;
  onJoined: (token: string) => void;
  onSignIn: () => void;
  onSignOut: () => void;
};

export default function HomeScreen({ accessToken, user, onOpenWallet, onOpenHost, onJoined, onSignIn, onSignOut }: Props) {
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [fee, setFee] = useState<{ cents: number; title: string } | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function join(paymentSessionId?: string) {
    const { response, data } = await api("/api/rooms/join", {
      method: "POST",
      body: { code, displayName, ...(paymentSessionId ? { paymentSessionId } : {}) },
      accessToken: paymentSessionId ? accessToken : null,
      mobile: true,
    });
    if (response.status === 402 && data.paymentRequired) {
      setFee({
        cents: typeof data.entryFeeCents === "number" ? data.entryFeeCents : 0,
        title: typeof data.roomTitle === "string" ? data.roomTitle : "This room",
      });
      return;
    }
    if (!response.ok) throw new Error(responseError(data, "Could not join this room."));
    const token = typeof data.roomSessionToken === "string" ? data.roomSessionToken : "";
    if (!token) throw new Error("The server did not create a secure room session.");
    await SecureStore.setItemAsync(ROOM_SESSION_KEY, token);
    setFee(null);
    onJoined(token);
  }

  async function handleJoin() {
    setError("");
    setPending(true);
    try {
      await join();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join this room.");
    } finally {
      setPending(false);
    }
  }

  async function useCoins() {
    if (!accessToken || !fee) {
      setError("Sign in with Google before spending coins.");
      return;
    }
    setError("");
    setPending(true);
    try {
      const payment = await api("/api/coins/entry", {
        method: "POST",
        body: { code, displayName },
        accessToken,
      });
      if (!payment.response.ok || typeof payment.data.paymentSessionId !== "string") {
        throw new Error(responseError(payment.data, "Could not pay with coins."));
      }
      await join(payment.data.paymentSessionId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not pay with coins.");
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={{ gap: 18 }}>
      <View style={{ paddingVertical: 18, gap: 10 }}>
        <Text style={styles.eyebrow}>PRIVATE FIRST LISTENS</Text>
        <Text style={styles.title}>Your invite.{`\n`}Your room.</Text>
        <Text style={styles.subtitle}>Join the artist and listeners for a private, synchronized first listen.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>ENTER A ROOM</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={(value) => { setCode(value); setFee(null); setError(""); }}
          placeholder="Invitation code"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={128}
        />
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Display name"
          placeholderTextColor={colors.muted}
          maxLength={32}
        />
        {fee && (
          <View style={styles.card}>
            <Text style={styles.body}>{fee.title} entry: ${(fee.cents / 100).toFixed(2)}</Text>
            <Text style={styles.muted}>{fee.cents % 10 === 0 ? `${fee.cents / 10} coins · 1 USD = 10 coins` : "This entry amount cannot be paid with whole coins."}</Text>
            {!user && (
              <Pressable style={styles.button} onPress={onSignIn}>
                <Text style={styles.buttonText}>Sign in with Google</Text>
              </Pressable>
            )}
            {fee.cents % 10 === 0 && accessToken && (
              <Pressable style={styles.button} disabled={pending} onPress={() => void useCoins()}>
                <Text style={styles.buttonText}>{pending ? "Joining..." : `Pay ${fee.cents / 10} coins and enter`}</Text>
              </Pressable>
            )}
            <Text style={styles.muted}>Buy coins with Apple or Google in-app purchase in your wallet.</Text>
          </View>
        )}
        <Pressable style={styles.button} disabled={pending || !code.trim() || !displayName.trim()} onPress={() => void handleJoin()}>
          <Text style={styles.buttonText}>{pending ? "Checking invitation..." : "Join listening room"}</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <View style={styles.row}>
        <Pressable style={[styles.button, styles.buttonSecondary, { flex: 1 }]} onPress={onOpenWallet}>
          <Text style={styles.buttonText}>Coin wallet</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.buttonSecondary, { flex: 1 }]} onPress={onOpenHost}>
          <Text style={styles.buttonText}>Host studio</Text>
        </Pressable>
      </View>
      {user?.email ? (
        <View style={styles.row}>
          <Text style={[styles.muted, { flex: 1 }]}>Signed in as {user.email}</Text>
          <Pressable onPress={onSignOut}><Text style={styles.muted}>Sign out</Text></Pressable>
        </View>
      ) : <Text style={styles.muted}>Listener accounts keep your wallet synced across devices.</Text>}
    </View>
  );
}
