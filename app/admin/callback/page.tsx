"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function AdminGoogleCallback() {
  const [message, setMessage] = useState("Verifying your Google account...");

  useEffect(() => {
    async function finish() {
      if (!supabase) return setMessage("Supabase is not configured.");
      const { data, error } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (error || !accessToken) return setMessage("Google sign-in could not be completed. Return to /admin and try again.");
      try {
        const response = await fetch("/api/admin/google-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        const result = await response.json();
        await supabase.auth.signOut();
        if (!response.ok) return setMessage(result.error || "This Google account cannot access the admin dashboard.");
        window.location.replace("/admin");
      } catch {
        await supabase.auth.signOut();
        setMessage("Admin sign-in is temporarily unavailable. Try again shortly.");
      }
    }
    void finish();
  }, []);

  return (
    <main style={{ maxWidth: 420, margin: "12vh auto", padding: 24 }} aria-live="polite">
      <h1>Admin Google sign in</h1>
      <p>{message}</p>
      <p><a href="/admin">Back to admin sign in</a></p>
    </main>
  );
}
