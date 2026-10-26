import { useEffect, useState } from "react";
import { ActivityIndicator, SafeAreaView, ScrollView, Text, View } from "react-native";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./src/supabase";
import { colors, styles } from "./src/theme";
import type { GoogleLoginResult } from "./src/auth-types";
import HomeScreen from "./src/screens/HomeScreen";
import WalletScreen from "./src/screens/WalletScreen";
import RoomScreen from "./src/screens/RoomScreen";
import HostScreen from "./src/screens/HostScreen";

const HOST_SESSION_KEY = "fi-mobile-host-session";
const ROOM_SESSION_KEY = "fi-mobile-room-session";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [roomToken, setRoomToken] = useState<string | null>(null);
  const [screen, setScreen] = useState<"home" | "wallet" | "room" | "host">("home");
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      SecureStore.getItemAsync(HOST_SESSION_KEY),
      SecureStore.getItemAsync(ROOM_SESSION_KEY),
      supabase?.auth.getSession(),
    ]).then(([savedHost, savedRoom, auth]) => {
      if (!active) return;
      setHostToken(savedHost);
      setRoomToken(savedRoom);
      if (auth && !auth.error) setSession(auth.data.session);
      if (savedRoom) setScreen("room");
      setAuthReady(true);
    }).catch(() => {
      if (active) {
        setAuthError("Could not restore your saved sign-in.");
        setAuthReady(true);
      }
    });
    const listener = supabase?.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      active = false;
      listener?.data.subscription.unsubscribe();
    };
  }, []);

  async function signInWithGoogle(): Promise<GoogleLoginResult> {
    if (!supabase) throw new Error("Set the Supabase URL and publishable key in mobile/.env.");
    setAuthError("");
    const redirectTo = Linking.createURL("auth/callback");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } },
    });
    if (error || !data.url) throw new Error(error?.message ?? "Google sign-in could not be started.");

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") throw new Error("Google sign-in was cancelled.");
    const callback = new URL(result.url);
    const code = callback.searchParams.get("code");
    if (!code) throw new Error(callback.searchParams.get("error_description") ?? "Google sign-in did not return an authorization code.");
    const { data: exchanged, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError || !exchanged.session || !exchanged.user) {
      throw new Error(exchangeError?.message ?? "Could not finish Google sign-in.");
    }
    setSession(exchanged.session);
    return { user: exchanged.user, session: exchanged.session };
  }

  async function saveHostToken(token: string | null) {
    setHostToken(token);
    if (token) await SecureStore.setItemAsync(HOST_SESSION_KEY, token);
    else await SecureStore.deleteItemAsync(HOST_SESSION_KEY);
  }

  async function saveRoomToken(token: string | null) {
    setRoomToken(token);
    if (token) await SecureStore.setItemAsync(ROOM_SESSION_KEY, token);
    else await SecureStore.deleteItemAsync(ROOM_SESSION_KEY);
  }

  async function signOut() {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error("Could not sign out from this device.");
    }
    await Promise.all([saveHostToken(null), saveRoomToken(null)]);
    setScreen("home");
  }

  async function handleJoined(token: string) {
    await saveRoomToken(token);
    setScreen("room");
  }

  if (!authReady) {
    return (
      <SafeAreaView style={[styles.screen, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[styles.muted, { marginTop: 12 }]}>Preparing your listening room...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.row}>
          <Text style={styles.brand}>FAMOUS INTROVERT</Text>
          <Text style={[styles.eyebrow, { marginLeft: "auto" }]}>LISTENING ROOMS</Text>
        </View>
        {authError ? <Text style={styles.error}>{authError}</Text> : null}
        {screen === "home" && (
          <HomeScreen
            accessToken={session?.access_token ?? null}
            user={session?.user ?? null}
            onOpenWallet={() => setScreen("wallet")}
            onOpenHost={() => setScreen("host")}
            onJoined={(token) => void handleJoined(token)}
            onSignOut={() => void signOut().catch((error: unknown) => setAuthError(error instanceof Error ? error.message : "Sign out failed."))}
            onSignIn={() => void signInWithGoogle().catch((error: unknown) => setAuthError(error instanceof Error ? error.message : "Sign-in failed."))}
          />
        )}
        {screen === "wallet" && (
          <WalletScreen
            accessToken={session?.access_token ?? null}
            userId={session?.user.id ?? null}
            onBack={() => setScreen("home")}
            onSignIn={signInWithGoogle}
          />
        )}
        {screen === "room" && roomToken && (
          <RoomScreen
            roomToken={roomToken}
            accessToken={session?.access_token ?? null}
            hostToken={hostToken}
            onLeave={() => void saveRoomToken(null).then(() => setScreen("home"))}
          />
        )}
        {screen === "host" && (
          <HostScreen
            hostToken={hostToken}
            accessToken={session?.access_token ?? null}
            onSaveHostToken={saveHostToken}
            onSignInGoogle={signInWithGoogle}
            onBack={() => setScreen("home")}
            onSignOut={() => void signOut().catch((error: unknown) => setAuthError(error instanceof Error ? error.message : "Sign out failed."))}
            onEnterRoom={(token) => void handleJoined(token)}
          />
        )}
        <Text style={[styles.muted, { textAlign: "center", marginTop: 6 }]}>Private first listens, shared in real time.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
