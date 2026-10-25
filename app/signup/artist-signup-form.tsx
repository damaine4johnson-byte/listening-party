"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { ARTIST_TIERS, type ArtistTier } from "../../lib/artist-tiers";

export default function ArtistSignupForm() {
  const [planTier, setPlanTier] = useState<ArtistTier>("free");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function signUp() {
    setError("");
    if (!supabase) {
      setError("Supabase sign-in is not configured.");
      return;
    }

    setPending(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/signup/callback?tier=${planTier}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (oauthError) {
      setError("Google signup could not be started. Check the Supabase Google provider settings.");
      setPending(false);
    }
  }

  return (
    <>
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
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn" type="button" onClick={() => void signUp()} disabled={pending}>
          {pending ? "Opening Google..." : "Sign up with Google"}
        </button>
      </div>
      {planTier !== "free" && <p className="small" role="status">Your paid tier will remain pending and room capacity stays at 100 until billing is activated.</p>}
      {error && <p className="small" role="alert">{error}</p>}
    </>
  );
}