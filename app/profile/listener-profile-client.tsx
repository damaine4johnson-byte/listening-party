"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

type Profile = { displayName: string; bio: string; avatarUrl: string };

const EMAIL_PLACEHOLDER_AVATAR = false;

export default function ListenerProfileClient() {
  const [signedIn, setSignedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [balanceCoins, setBalanceCoins] = useState<number | null>(null);
  const [coinsPerUsd, setCoinsPerUsd] = useState(10);
  const [profile, setProfile] = useState<Profile>({ displayName: "", bio: "", avatarUrl: "" });
  const [form, setForm] = useState<Profile>({ displayName: "", bio: "", avatarUrl: "" });
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadProfile = useCallback(async (accessToken: string) => {
    const response = await fetch("/api/listeners/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load your profile.");
    const loaded: Profile = {
      displayName: result.profile.displayName || (result.email ? result.email.split("@")[0] : ""),
      bio: result.profile.bio,
      avatarUrl: result.profile.avatarUrl,
    };
    setEmail(result.email ?? "");
    setBalanceCoins(typeof result.balanceCoins === "number" ? result.balanceCoins : null);
    setCoinsPerUsd(typeof result.coinsPerUsd === "number" ? result.coinsPerUsd : 10);
    setProfile(loaded);
    setForm(loaded);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      setError("Listener sign-in is not configured.");
      return;
    }
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      if (!session) setChecking(false);
    });
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const accessToken = data.session?.access_token;
      setSignedIn(Boolean(accessToken));
      if (!accessToken) {
        setChecking(false);
        return;
      }
      try {
        await loadProfile(accessToken);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load your profile.");
      } finally {
        if (active) setChecking(false);
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!form.displayName.trim()) {
      setError("Enter a display name.");
      return;
    }
    setPending(true);
    try {
      const { data: sessionData } = await supabase!.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setError("Sign in with Google before editing your profile.");
        return;
      }
      const response = await fetch("/api/listeners/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          displayName: form.displayName,
          bio: form.bio,
          avatarUrl: form.avatarUrl,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Could not save your profile.");
        return;
      }
      const saved: Profile = {
        displayName: result.profile.displayName,
        bio: result.profile.bio,
        avatarUrl: result.profile.avatarUrl,
      };
      setProfile(saved);
      setEditing(false);
      setNotice("Your profile has been saved.");
    } catch {
      setError("Your profile could not be saved. Try again shortly.");
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError("Could not sign out.");
    else {
      setSignedIn(false);
      setBalanceCoins(null);
    }
  }

  if (checking) {
    return (
      <section className="panel" aria-live="polite">
        <p className="muted">Loading your profile...</p>
      </section>
    );
  }

  if (!signedIn) {
    return (
      <section className="panel" aria-live="polite">
        <h2>Sign in to view your profile</h2>
        <p className="small">Your listener profile and coin wallet are tied to your Google account.</p>
        <Link className="btn" href="/signin">Sign in with Google</Link>
        {error && <p className="small" role="alert">{error}</p>}
      </section>
    );
  }

  const initials = (profile.displayName || email.split("@")[0] || "L").charAt(0).toUpperCase();
  const coinDollars = balanceCoins === null ? null : balanceCoins / coinsPerUsd;

  return (
    <section className="panel" aria-live="polite">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="row" style={{ gap: 12, alignItems: "center" }}>
          {profile.avatarUrl && !EMAIL_PLACEHOLDER_AVATAR
            ? <img src={profile.avatarUrl} alt="" className="rm-avatar" style={{ width: 48, height: 48 }} />
            : <span className="rm-avatar fallback" style={{ width: 48, height: 48, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{initials}</span>}
          <div>
            <strong>{profile.displayName || "Listener"}</strong>
            <div className="small">{email}</div>
          </div>
        </div>
        <button className="btn secondary" type="button" onClick={() => void signOut()}>Sign out</button>
      </div>

      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginTop: 16 }}>
        <div>
          <div className="eyebrow">Coin balance</div>
          <h2 style={{ margin: 0 }}>
            {balanceCoins === null ? "Loading..." : `${balanceCoins.toLocaleString()} coins`}
            {coinDollars !== null && <span className="small"> · about ${coinDollars.toFixed(2)}</span>}
          </h2>
        </div>
        <Link className="btn secondary" href="/wallet">Top up coins</Link>
      </div>
      <p className="small">1 USD = {coinsPerUsd} coins. Spend coins on paid room entry and song boosts.</p>

      <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "16px 0" }} />

      {!editing ? (
        <>
          <div className="eyebrow">Profile</div>
          {profile.bio && <p>{profile.bio}</p>}
          {!profile.bio && <p className="muted">No bio yet.</p>}
          <button className="btn" type="button" onClick={() => { setForm(profile); setEditing(true); }}>
            Edit profile
          </button>
        </>
      ) : (
        <form onSubmit={saveProfile}>
          <div className="field">
            <label htmlFor="listener-name">Display name (shown in room chat)</label>
            <input
              id="listener-name"
              value={form.displayName}
              maxLength={32}
              required
              onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="listener-bio">Short bio (up to 200 characters)</label>
            <textarea
              id="listener-bio"
              value={form.bio}
              maxLength={200}
              rows={3}
              onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="listener-avatar">Avatar image URL (https://)</label>
            <input
              id="listener-avatar"
              type="url"
              value={form.avatarUrl}
              maxLength={2048}
              placeholder="https://example.com/photo.jpg"
              onChange={(event) => setForm((current) => ({ ...current, avatarUrl: event.target.value }))}
            />
          </div>
          <div className="row">
            <button className="btn" type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save profile"}
            </button>
            <button className="btn secondary" type="button" disabled={pending} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {notice && <p className="small" role="status">{notice}</p>}
      {error && <p className="small" role="alert">{error}</p>}
      <div className="row">
        <Link href="/wallet" className="small">Coin wallet</Link>
        <Link href="/" className="small">Back to rooms</Link>
      </div>
    </section>
  );
}
