"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

export default function ListenerSigninForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    // Already signed in? Skip straight to the profile.
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) window.location.replace("/profile");
    });
  }, []);

  async function signIn() {
    setError("");
    if (!supabase) {
      setError("Listener sign-in is not configured.");
      return;
    }
    setPending(true);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/wallet/callback?next=/profile` },
    });
    if (authError) {
      setError("Google sign-in could not be started. Check the Supabase Google provider settings.");
      setPending(false);
    }
  }

  async function passwordSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!supabase) { setError("Listener sign-in is not configured."); return; }
    setPending(true);
    try {
      const response = await fetch("/api/listeners/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }),
      });
      const d = await response.json().catch(() => ({}));
      if (!response.ok) { setError(d.error || "Could not sign in."); setPending(false); return; }
      const { error: sessionError } = await supabase.auth.setSession({ access_token: d.access_token, refresh_token: d.refresh_token });
      if (sessionError) { setError("Could not sign in."); setPending(false); return; }
      window.location.replace("/profile");
    } catch {
      setError("Could not sign in. Try again."); setPending(false);
    }
  }

  return (
    <section className="panel" aria-live="polite">
      <h2>Listener sign-in</h2>
      <p className="small">
        Sign in with Google to set up your listener profile, keep your coin wallet across devices,
        and get your photo in the room chat.
      </p>
      <button className="btn" type="button" onClick={() => void signIn()} disabled={pending}>
        {pending ? "Opening Google..." : "Sign in with Google"}
      </button>
      <form onSubmit={passwordSignIn} style={{ marginTop: 16 }}>
        <p className="small">Already signed up with Google? Use the username and password you set in your profile.</p>
        <div className="field">
          <label htmlFor="li-user">Username or email</label>
          <input id="li-user" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="li-pass">Password</label>
          <input id="li-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        <button className="btn secondary" type="submit" disabled={pending}>Sign in with password</button>
      </form>
      {error && <p className="small" role="alert">{error}</p>}
      <p className="small">Your Google account is used only for sign-in and your wallet.</p>
    </section>
  );
}
