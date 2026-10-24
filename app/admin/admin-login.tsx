"use client";

import { FormEvent, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Admin sign-in failed.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Admin sign-in is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

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
      <form onSubmit={signInWithPassword}>
        <div className="field">
          <label htmlFor="admin-username">Username</label>
          <input id="admin-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={256} required />
        </div>
        <div className="field">
          <label htmlFor="admin-password">Password</label>
          <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={512} required />
        </div>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <div className="divider" />
      <p className="muted">Or sign in with a developer Google account on the allowlist.</p>
      <button className="btn secondary" type="button" onClick={() => void signIn()} disabled={pending}>
        {pending ? "Opening Google..." : "Continue with Google"}
      </button>
      {error && <p className="small" role="alert">{error}</p>}
    </section>
  );
}