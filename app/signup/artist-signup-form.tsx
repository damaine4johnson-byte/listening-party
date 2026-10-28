"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { ARTIST_TIERS, type ArtistTier } from "../../lib/artist-tiers";

export default function ArtistSignupForm() {
  const [planTier, setPlanTier] = useState<ArtistTier>("free");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [audience, setAudience] = useState<"listener" | "artist" | null>(null);

  async function signUp() {
    setError("");
    if (!supabase) {
      setError("Supabase sign-in is not configured.");
      return;
    }

    setPending(true);
    const redirectTo = audience === "listener"
      ? `${window.location.origin}/wallet/callback?next=/profile`
      : `${window.location.origin}/signup/callback?tier=${planTier}`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { prompt: "select_account" },
      },
    });
    if (oauthError) {
      setError("Google signup could not be started. Check the Supabase Google provider settings.");
      setPending(false);
    }
  }

  if (audience === null) {
    return (
      <>
        <h2 style={{ margin: "0 0 12px" }}>What brings you here?</h2>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <button
            className="panel"
            type="button"
            style={{ cursor: "pointer", textAlign: "left" }}
            onClick={() => setAudience("listener")}
          >
            <strong>I'm a listener</strong>
            <span className="small" style={{ display: "block", marginTop: 8 }}>
              Join private listening rooms, keep a coin wallet, and set up your chat profile.
            </span>
          </button>
          <button
            className="panel"
            type="button"
            style={{ cursor: "pointer", textAlign: "left" }}
            onClick={() => setAudience("artist")}
          >
            <strong>I'm an artist</strong>
            <span className="small" style={{ display: "block", marginTop: 8 }}>
              Host your own listening rooms, upload your music, and earn from tips and entry fees.
            </span>
          </button>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="small" type="button" style={{ background: "none", border: 0, cursor: "pointer", textDecoration: "underline" }} onClick={() => setAudience("listener")}>
            Just want to listen? Pick listener.
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {audience === "listener" ? (
        <>
          <h2 style={{ margin: "0 0 8px" }}>Set up your listener account</h2>
          <p className="small">
            Sign in with Google to create your profile and coin wallet. You can always explore
            artist tiers later from the host console.
          </p>
        </>
      ) : (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="small" style={{ marginBottom: 12 }}>Choose a tier</legend>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {ARTIST_TIERS.map((tier) => (
            <label className="panel" key={tier.id} style={{ cursor: "pointer", borderColor: planTier === tier.id ? "var(--red)" : undefined }}>
              <span className="row" style={{ justifyContent: "space-between" }}>
                <strong>{tier.name}</strong>
                <input
                  type="radio"
                  name="artist-tier"
                  value={tier.id}
                  checked={planTier === tier.id}
                  onChange={() => setPlanTier(tier.id)}
                />
              </span>
              <span className="eyebrow">{tier.price}</span>
              <span className="muted" style={{ display: "block", marginTop: 8 }}>
                Up to {tier.maxListeners.toLocaleString()} listeners
              </span>
              <span className="small" style={{ display: "block", marginTop: 8 }}>
                {tier.ads ? "Ad-supported rooms" : "Ad-free rooms when active"}
              </span>
              <span className="small" style={{ display: "block", marginTop: 12 }}>
                <strong>Included</strong>
              </span>
              <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
                {tier.perks.map((perk) => <li key={perk}>{perk}</li>)}
              </ul>
              <span className="small" style={{ display: "block", marginTop: 12 }}>
                <strong>Not included</strong>
              </span>
              <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
                {tier.notIncluded.map((limitation) => <li key={limitation}>{limitation}</li>)}
              </ul>
              {tier.id !== "free" && <span className="small">Billing activation is not available yet.</span>}
            </label>
          ))}
        </div>
        </fieldset>
      )}
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn" type="button" onClick={() => void signUp()} disabled={pending}>
          {pending ? "Opening Google..." : audience === "listener" ? "Sign up as a listener" : "Sign up as an artist"}
        </button>
        <button className="btn secondary" type="button" disabled={pending} onClick={() => setAudience(null)}>
          Back
        </button>
      </div>
      {audience === "artist" && planTier !== "free" && <p className="small" role="status">Your paid tier will remain pending and room capacity stays at 100 until billing is activated.</p>}
      {error && <p className="small" role="alert">{error}</p>}
    </>
  );
}