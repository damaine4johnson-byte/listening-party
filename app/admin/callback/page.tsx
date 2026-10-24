"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function AdminGoogleCallback() {
  const [message, setMessage] = useState("Verifying developer account...");

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
        setMessage("Google sign-in could not be completed. Return to admin sign-in and try again.");
        return;
      }

      try {
        const response = await fetch("/api/admin/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        const result = await response.json();
        await supabase.auth.signOut();
        if (!response.ok) {
          if (active) setMessage(result.error || "This account is not approved for developer access.");
          return;
        }
        window.location.replace("/admin");
      } catch {
        await supabase.auth.signOut();
        if (active) setMessage("Admin sign-in is temporarily unavailable.");
      }
    }

    void finishSignIn();
    return () => { active = false; };
  }, []);

  return (
    <main className="wrap">
      <section className="panel" aria-live="polite">
        <h1>Developer sign in</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}