"use client";

import { useEffect, useState } from "react";
import { getOAuthAccessToken } from "../../../lib/oauth-callback";
import { oauthCallbackUrl, supabase } from "../../../lib/supabase";

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

      const requestedNext = new URLSearchParams(window.location.search).get("next");
      const response = await fetch("/api/auth/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, next: requestedNext }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (active) setMessage(result.error || "Could not resolve your account.");
        return;
      }
      if (result.accountType === "host") await supabase.auth.signOut();
      window.location.replace(result.destination === "/wallet" || result.destination === "/host"
        ? result.destination
        : result.accountType === "host" ? "/host/profile" : "/profile");
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