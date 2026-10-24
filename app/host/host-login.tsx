"use client";

import { FormEvent, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function HostLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function signInWithGoogle() {
    setError("");
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setPending(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/host/callback`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (oauthError) {
      setError("Google sign-in could not be started. Check the Supabase Google provider settings.");
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    try {
      const response = await fetch("/api/host/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Host sign-in failed.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Host service is unavailable. Try again shortly.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="host-login-title">
      <h2 id="host-login-title">Host sign in</h2>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="host-username">Username</label>
          <input
            id="host-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            maxLength={256}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="host-password">Password</label>
          <input
            id="host-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Signing in..." : "Sign in"}
        </button>
        <div className="divider" />
        <button className="btn secondary" type="button" onClick={() => void signInWithGoogle()} disabled={pending}>
          Continue with Google
        </button>
        {error && <p role="alert" className="small">{error}</p>}
      </form>
    </section>
  );
}