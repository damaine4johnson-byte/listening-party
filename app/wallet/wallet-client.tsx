"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

const PACKS = [
  { coins: 50, dollars: 5 },
  { coins: 100, dollars: 10 },
  { coins: 200, dollars: 20 },
] as const;

export default function WalletClient() {
  const [signedIn, setSignedIn] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refreshBalance = useCallback(async (accessToken: string) => {
    const response = await fetch("/api/coins/balance", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || typeof result.balance !== "number") {
      throw new Error(result.error || "Could not load your coin balance.");
    }
    setBalance(result.balance);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      if (session?.access_token) {
        void refreshBalance(session.access_token).catch((cause: unknown) => {
          if (active) setError(cause instanceof Error ? cause.message : "Could not load your coin balance.");
        });
      } else {
        setBalance(null);
      }
    });
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError("Could not verify your listener account.");
        return;
      }
      setSignedIn(Boolean(data.session));
      if (data.session?.access_token) {
        void refreshBalance(data.session.access_token).catch((cause: unknown) => {
          if (active) setError(cause instanceof Error ? cause.message : "Could not load your coin balance.");
        });
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [refreshBalance]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("coins") === "added") setNotice("Your coins have been added.");
    if (params.get("purchase") === "failed") setError("Coin purchase was not completed.");
    if (params.get("purchase") === "error") setError("Payment was received, but coin delivery needs support. Please contact the site administrator.");
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
      options: { redirectTo: `${window.location.origin}/wallet/callback` },
    });
    if (authError) {
      setError("Google sign-in could not be started. Check the Supabase Google provider settings.");
      setPending(false);
    }
  }

  async function buyCoins(coins: number) {
    setError("");
    if (!supabase) {
      setError("Listener sign-in is not configured.");
      return;
    }
    setPending(true);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (sessionError || !accessToken) {
        setError("Sign in with Google before buying coins.");
        return;
      }
      const response = await fetch("/api/coins/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ pack: String(coins) }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.url !== "string") {
        setError(result.error || "Could not start coin checkout.");
        return;
      }
      window.location.assign(result.url);
    } catch {
      setError("Coin checkout is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError("Could not sign out.");
    else {
      setBalance(null);
      setSignedIn(false);
    }
  }

  return (
    <section className="panel" aria-live="polite">
      {!signedIn ? (
        <>
          <h2>Sign in to your listener wallet</h2>
          <p className="small">Use your Google account to keep your coin balance available across devices.</p>
          <button className="btn" type="button" onClick={() => void signIn()} disabled={pending}>
            {pending ? "Opening Google..." : "Sign in with Google"}
          </button>
        </>
      ) : (
        <>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="eyebrow">Available balance</div>
              <h2>{balance === null ? "Loading..." : `${balance.toLocaleString()} coins`}</h2>
            </div>
            <button className="btn secondary" type="button" onClick={() => void signOut()}>Sign out</button>
          </div>
          <p className="small">1 USD = 10 coins. Coins can be used for paid room entry and song boosts.</p>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            {PACKS.map((pack) => (
              <button
                className="btn"
                key={pack.coins}
                type="button"
                disabled={pending}
                onClick={() => void buyCoins(pack.coins)}
              >
                Buy {pack.coins} coins · ${pack.dollars}
              </button>
            ))}
          </div>
        </>
      )}
      {notice && <p className="small" role="status">{notice}</p>}
      {error && <p className="small" role="alert">{error}</p>}
      <p className="small">Secure card checkout is provided by WiPay. Coin balances are linked to your Google account.</p>
      <Link href="/" className="small">Back to rooms</Link>
    </section>
  );
}
