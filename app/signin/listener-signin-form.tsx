"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import styles from "./signin.module.css";

export default function ListenerSigninForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    // Let the server route an existing session to the matching account type.
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) window.location.replace("/auth/callback?next=/profile");
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
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/profile`, queryParams: { prompt: "select_account" } },
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
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) { setError("Could not verify your account."); setPending(false); return; }
      const routeResponse = await fetch("/api/auth/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, next: "/profile" }),
      });
      const routeResult = await routeResponse.json();
      if (!routeResponse.ok) { setError(routeResult.error || "Could not resolve your account."); setPending(false); return; }
      if (routeResult.accountType === "host") await supabase.auth.signOut();
      window.location.replace(routeResult.destination === "/host" ? "/host" : routeResult.accountType === "host" ? "/host/profile" : "/profile");
    } catch {
      setError("Could not sign in. Try again."); setPending(false);
    }
  }

  return (
    <section className={styles.auth} aria-live="polite">
      <div className={styles.authTop}><span className={styles.authDot} /> MEMBER ACCESS</div>
      <h2>Sign in</h2>
      <p className={styles.authCopy}>Your email determines whether you open a host or listener account.</p>
      <button className={styles.googleButton} type="button" onClick={() => void signIn()} disabled={pending}>
        <span className={styles.googleMark} aria-hidden="true">G</span>
        <span>{pending ? "Opening Google..." : "Continue with Google"}</span>
        <span className={styles.buttonArrow} aria-hidden="true">↗</span>
      </button>
      <details className={styles.passwordDetails}>
        <summary>Use username and password</summary>
        <form onSubmit={passwordSignIn} className={styles.passwordForm}>
          <p>For listeners with saved login details.</p>
          <div className="field">
            <label htmlFor="li-user">Username or email</label>
            <input id="li-user" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoComplete="username" />
          </div>
          <div className="field">
            <label htmlFor="li-pass">Password</label>
            <input id="li-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          <button className={styles.passwordButton} type="submit" disabled={pending}>Sign in with password</button>
        </form>
      </details>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <p className={styles.privacy}>Secure sign-in · your account stays yours</p>
    </section>
  );
}
