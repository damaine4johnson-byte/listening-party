"use client";

import { useEffect, useState } from "react";
import { getOAuthAccessToken } from "../../../lib/oauth-callback";
import { oauthCallbackUrl, supabase } from "../../../lib/supabase";
import { listenerRoomDestination } from "../../../lib/listener-room-return";

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Finding your account...");

  useEffect(() => {
    let active = true;

    async function resolveAccount() {
      if (!supabase) {
        setMessage("Sign-in is not configured.");
        return;
      }
      const { accessToken, error } = await getOAuthAccessToken(supabase, oauthCallbackUrl);
      if (error || !accessToken) {
        setMessage(error ?? "Sign-in could not be completed. Return and try again.");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const requestedNext = params.get("next");
      const roomId = params.get("roomId");
      const response = await fetch("/api/auth/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, next: requestedNext, roomId }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (active) setMessage(result.error || "Could not resolve your account.");
        return;
      }
      if (result.accountType === "host") await supabase.auth.signOut();
      const roomDestination = listenerRoomDestination(roomId);
      window.location.replace(result.accountType === "listener" && roomDestination && result.destination === roomDestination
        ? roomDestination
        : result.destination === "/wallet" || result.destination === "/host"
        ? result.destination
        : result.accountType === "host" ? "/profile" : "/profile");
    }

    void resolveAccount().catch(() => {
      if (active) setMessage("Sign-in is temporarily unavailable.");
    });
    return () => { active = false; };
  }, []);

  return (
    <main className="wrap">
      <section className="panel" aria-live="polite">
        <h1>Signing you in</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}