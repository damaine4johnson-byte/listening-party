"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

type Withdrawal = { id: string; coins: number; status: string; created_at: string };

// Balance/Bank: purchase coins, see the account balance, request a withdrawal.
// Same wallet underneath — labelled "Balance" in the menu, "Bank" in the header.
export default function BankClient() {
  const [signedIn, setSignedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const [balance, setBalance] = useState<number | null>(null);
  const [earned, setEarned] = useState(0);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const token = useCallback(async () => (await supabase?.auth.getSession())?.data.session?.access_token ?? "", []);

  const refresh = useCallback(async () => {
    const t = await token();
    if (!t) return;
    const [balanceRes, bankRes] = await Promise.all([
      fetch("/api/coins/balance", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" }),
      fetch("/api/bank", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" }),
    ]);
    if (balanceRes.ok) setBalance((await balanceRes.json()).balance ?? 0);
    if (bankRes.ok) {
      const d = await bankRes.json();
      setEarned(d.earnedCents ?? 0);
      setWithdrawals(d.withdrawals ?? []);
    }
  }, [token]);

  useEffect(() => {
    if (!supabase) { setChecking(false); setError("Sign-in is not configured."); return; }
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((_e: string, session: { access_token?: string } | null) => setSignedIn(Boolean(session)));
    void supabase.auth.getSession().then(async ({ data: d }) => {
      if (!active) return;
      setSignedIn(Boolean(d.session));
      if (d.session) await refresh();
      setChecking(false);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("coins") === "added") setNotice("Your coins have been added.");
    if (params.get("purchase") === "failed") setError("Coin purchase was not completed.");
  }, []);

  async function buy(pack: string) {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/coins/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ pack }),
      });
      const d = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(d.error || "Could not start the purchase.");
      window.location.assign(d.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the purchase.");
      setPending(false);
    }
  }

  async function withdraw() {
    if (!window.confirm("Request to withdraw your earned balance to your payout method? An admin approves payouts.")) return;
    setPending(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/bank", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({}),
      });
      const d = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(d.error || "Could not request the withdrawal.");
      setNotice("Withdrawal requested. An admin will review it.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not request the withdrawal.");
    } finally {
      setPending(false);
    }
  }

  if (checking) return <section className="panel" aria-live="polite"><p className="muted">Loading your bank…</p></section>;

  if (!signedIn) {
    return (
      <section className="panel" aria-live="polite">
        <h2>Sign in to view your balance</h2>
        <p className="small">Your coin balance, purchases and withdrawals are tied to your account.</p>
        <Link className="btn" href="/signin">Sign in</Link>
      </section>
    );
  }

  return (
    <section className="panel bank" aria-live="polite">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Balance</h2>
        <h3 style={{ margin: 0 }}>{balance === null ? "…" : `${balance.toLocaleString()} coins`}</h3>
      </div>
      <p className="small muted">1 USD = 10 coins. Coins buy room entry, song boosts and tips.</p>

      {notice && <p className="small" role="status">{notice}</p>}
      {error && <p className="small" role="alert">{error}</p>}

      <div className="eyebrow">Buy coins</div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
        {["50", "100", "200", "500", "1000", "5000", "10000", "2500"].map((pack) => (
          <button key={pack} className="btn secondary" type="button" disabled={pending} onClick={() => void buy(pack)}>
            {Number(pack).toLocaleString()} coins · ${Number(pack) / 10}
          </button>
        ))}
      </div>

      <div className="eyebrow" style={{ marginTop: 18 }}>Earnings &amp; withdrawals</div>
      <div className="lp-stats">
        <div><strong>${(earned / 100).toFixed(2)}</strong><span>Earned (tips &amp; entries)</span></div>
        <div><strong>{withdrawals.filter((w) => w.status === "pending").length}</strong><span>Pending withdrawals</span></div>
        <div><strong>{withdrawals.filter((w) => w.status === "paid").length}</strong><span>Paid out</span></div>
      </div>
      <button className="btn" type="button" disabled={pending || earned <= 0} onClick={() => void withdraw()}>
        {pending ? "Requesting…" : "Withdraw earnings"}
      </button>
      {earned <= 0 && <p className="small muted">Withdrawals unlock once you have earnings from tips or paid rooms.</p>}

      {withdrawals.length > 0 && (
        <table style={{ marginTop: 14, width: "100%", fontSize: 13 }}>
          <thead><tr><th>Date</th><th>Coins</th><th>Status</th></tr></thead>
          <tbody>
            {withdrawals.slice(0, 8).map((w) => (
              <tr key={w.id}>
                <td>{new Date(w.created_at).toLocaleDateString()}</td>
                <td>{w.coins.toLocaleString()}</td>
                <td>{w.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
