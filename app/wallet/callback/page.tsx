"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getOAuthAccessToken } from "../../../lib/oauth-callback";
import { oauthCallbackUrl, supabase } from "../../../lib/supabase";

export default function ListenerWalletCallback() {
  const [message, setMessage] = useState("Verifying your Google account...");

  useEffect(() => {
    let active = true;
    async function finishSignIn() {
      if (!supabase) {
        setMessage("Listener sign-in is not configured.");
        return;
      }
      const { accessToken, error } = await getOAuthAccessToken(supabase, oauthCallbackUrl);
      if (error || !accessToken) {
        if (active) setMessage(error ?? "Google sign-in could not be completed. Return to the wallet and try again.");
        return;
      }
      // Honor ?next=/profile so sign-ins started from other pages land back there.
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/wallet";
      // A username chosen on the signup form is claimed on first sign-in.
      const chosenUsername = (params.get("username") ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
      if (chosenUsername && /^[a-z][a-z0-9_]{2,23}$/.test(chosenUsername)) {
        await fetch("/api/listeners/credentials", {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ username: chosenUsername }),
        }).catch(() => undefined);
      }
      const response = await fetch("/api/coins/balance", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!response.ok) {
        if (active) setMessage("Your wallet could not be loaded. Please try again.");
        return;
      }
      window.location.replace(destination);
    }
    void finishSignIn().catch(() => {
      if (active) setMessage("Listener sign-in is temporarily unavailable.");
    });
    return () => { active = false; };
  }, []);

  return (
    <main className="wrap">
      <section className="panel" aria-live="polite">
        <h1>Listener wallet</h1>
        <p>{message}</p>
        <Link href="/wallet">Return to wallet</Link>
      </section>
    </main>
  );
}
