"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

export default function ListenerSigninForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

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
      {error && <p className="small" role="alert">{error}</p>}
      <p className="small">Your Google account is used only for sign-in and your wallet.</p>
    </section>
  );
}
