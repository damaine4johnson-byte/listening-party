"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { isArtistTier } from "../../../lib/artist-tiers";

export default function ArtistSignupCallback() {
  const [message, setMessage] = useState("Verifying your Google account...");

  useEffect(() => {
    let active = true;

    async function finishSignup() {
      if (!supabase) {
        setMessage("Supabase signup is not configured.");
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (error || !accessToken) {
        setMessage("Google signup could not be completed. Return to artist signup and try again.");
        return;
      }

      const requestedTier = new URLSearchParams(window.location.search).get("tier");
      const planTier = isArtistTier(requestedTier) ? requestedTier : "free";
      try {
        const response = await fetch("/api/artists/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken, planTier }),
        });
        const result = await response.json();
        await supabase.auth.signOut();
        if (!response.ok) {
          if (active) setMessage(result.error || "Artist signup could not be completed.");
          return;
        }
        window.location.replace("/host/profile?welcome=1");
      } catch {
        await supabase.auth.signOut();
        if (active) setMessage("Artist signup is temporarily unavailable. Try again shortly.");
      }
    }

    void finishSignup();
    return () => { active = false; };
  }, []);

  return (
    <main className="wrap">
      <section className="panel" aria-live="polite">
        <h1>Artist signup</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}