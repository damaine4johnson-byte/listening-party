"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function HostGoogleCallback() {
  const [message, setMessage] = useState("Verifying your Google account...");

  useEffect(() => {
    let active = true;

    async function finishSignIn() {
      if (!supabase) {
        setMessage("Supabase is not configured.");
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (error || !accessToken) {
        setMessage("Google sign-in could not be completed. Return to host sign in and try again.");
        return;
      }

      try {
        const response = await fetch("/api/host/google-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        const result = await response.json();
        await supabase.auth.signOut();

        if (!response.ok) {
          if (active) setMessage(result.error || "This Google account cannot access the host console.");
          return;
        }

        window.location.replace("/host");
      } catch {
        await supabase.auth.signOut();
        if (active) setMessage("Host sign-in is temporarily unavailable. Try again shortly.");
      }
    }

    void finishSignIn();
    return () => { active = false; };
  }, []);

  return (
    <main className="wrap">
      <section className="panel" aria-live="polite">
        <h1>Google host sign in</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}