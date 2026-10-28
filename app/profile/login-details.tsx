"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

// Lets a Google-created listener choose a username and password for future sign-ins.
export default function LoginDetails() {
  const [state, setState] = useState<{ username: string | null; hasPassword: boolean; suggestion: string } | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function token() {
    return (await supabase?.auth.getSession())?.data.session?.access_token ?? "";
  }

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/listeners/credentials", { headers: { Authorization: `Bearer ${await token()}` }, cache: "no-store" });
      if (!response.ok) return;
      const d = await response.json();
      setState(d);
      setUsername(d.username ?? d.suggestion ?? "");
    })();
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setMessage("");
    const response = await fetch("/api/listeners/credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ username, password: password || undefined }),
    });
    const d = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) { setMessage(d.error || "Could not save."); return; }
    setState((s) => s && { ...s, username: d.username, hasPassword: s.hasPassword || Boolean(password) });
    setPassword("");
    setMessage("Saved. You can now sign in with your username and password.");
  }

  if (!state) return null;
  const needsPassword = !state.hasPassword;
  return (
    <form onSubmit={save} style={{ marginTop: 18 }}>
      <div className="eyebrow">Login details</div>
      <p className="muted">
        {state.username && state.hasPassword
          ? <>You can sign in with Google or with username <b>{state.username}</b> and your password.</>
          : "Choose a username and password so you can sign in without Google."}
      </p>
      <div className="field">
        <label htmlFor="ld-user">Username</label>
        <input id="ld-user" value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} maxLength={24} required autoComplete="username" />
      </div>
      <div className="field">
        <label htmlFor="ld-pass">{needsPassword ? "Password (8+ characters)" : "New password (leave blank to keep)"}</label>
        <input id="ld-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={72} required={needsPassword} autoComplete="new-password" />
      </div>
      <button className="btn" type="submit" disabled={pending}>{pending ? "Saving..." : "Save login details"}</button>
      {message && <p className="small" role="status">{message}</p>}
    </form>
  );
}
