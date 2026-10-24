"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminLogin() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function signIn() {
    setError("");
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setPending(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/admin/callback`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (oauthError) {
      setError("Google sign-in could not be started. Check Supabase OAuth settings.");
      setPending(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="admin-login-title">
      <h2 id="admin-login-title">Developer sign in</h2>
      <p className="muted">Only Google accounts on the developer allowlist can continue.</p>
      <button className="btn" type="button" onClick={() => void signIn()} disabled={pending}>
        {pending ? "Opening Google..." : "Continue with Google"}
      </button>
      {error && <p className="small" role="alert">{error}</p>}
    </section>
  );
}