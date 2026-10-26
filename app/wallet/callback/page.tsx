"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";

export default function ListenerWalletCallback() {
  const [message, setMessage] = useState("Verifying your Google account...");

  useEffect(() => {
    let active = true;
    async function finishSignIn() {
      if (!supabase) {
        setMessage("Listener sign-in is not configured.");
        return;
      }
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) {
        if (active) setMessage("Google sign-in could not be completed. Return to the wallet and try again.");
        return;
      }
      const response = await fetch("/api/coins/balance", {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store",
      });
      if (!response.ok) {
        if (active) setMessage("Your wallet could not be loaded. Please try again.");
        return;
      }
      window.location.replace("/wallet");
    }
    void finishSignIn().catch(() => {
      if (active) setMessage("Listener sign-in is temporarily unavailable.");
    });
    return () => { active = false; };
  }, []);

  return (
    <main className="wrap">
      <section className="panel" aria-live="polite">
        <h1>Listener wallet</h1>
        <p>{message}</p>
        <Link href="/wallet">Return to wallet</Link>
      </section>
    </main>
  );
}
