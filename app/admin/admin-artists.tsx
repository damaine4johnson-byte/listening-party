"use client";

import { useEffect, useState } from "react";
import { ARTIST_TIERS, type ArtistTier } from "../../lib/artist-tiers";

type Artist = {
  hostId: string;
  identity: string;
  provider: string;
  accountStatus: "active" | "suspended";
  displayName: string;
  contactEmail: string;
  planTier: ArtistTier;
  subscriptionStatus: "active" | "pending" | "canceled";
};

export default function AdminArtists() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [notice, setNotice] = useState("Loading artists...");
  const [savingId, setSavingId] = useState("");

  async function loadArtists() {
    try {
      const response = await fetch("/api/admin/artists", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load artists.");
      setArtists(result.artists);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load artists.");
    }
  }

  useEffect(() => { void loadArtists(); }, []);

  function editArtist(hostId: string, patch: Partial<Artist>) {
    setArtists((current) => current.map((artist) => artist.hostId === hostId ? { ...artist, ...patch } : artist));
  }

  async function saveArtist(artist: Artist) {
    setSavingId(artist.hostId);
    setNotice("");
    try {
      const response = await fetch("/api/admin/artists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostId: artist.hostId,
          accountStatus: artist.accountStatus,
          planTier: artist.planTier,
          subscriptionStatus: artist.subscriptionStatus,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save artist settings.");
      setNotice(`Updated ${artist.displayName || artist.identity}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save artist settings.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <section aria-labelledby="artists-heading">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 id="artists-heading">Artist accounts</h2>
        <button className="btn secondary" type="button" onClick={() => void loadArtists()}>Refresh</button>
      </div>
      {notice && <p className="small" role="status">{notice}</p>}
      <div className="host-room-table">
        {artists.map((artist) => (
          <article className="panel" key={artist.hostId} style={{ marginBottom: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>{artist.displayName || artist.identity}</strong>
                <div className="small">{artist.identity} · {artist.provider}</div>
                {artist.contactEmail && <div className="small">Contact: {artist.contactEmail}</div>}
              </div>
              <span className="tag">{artist.accountStatus}</span>
            </div>
            <div className="row" style={{ alignItems: "end", marginTop: 12 }}>
              <div className="field">
                <label htmlFor={`access-${artist.hostId}`}>Access</label>
                <select id={`access-${artist.hostId}`} value={artist.accountStatus} onChange={(event) => editArtist(artist.hostId, { accountStatus: event.target.value as Artist["accountStatus"] })}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor={`tier-${artist.hostId}`}>Tier</label>
                <select id={`tier-${artist.hostId}`} value={artist.planTier} onChange={(event) => editArtist(artist.hostId, { planTier: event.target.value as ArtistTier })}>
                  {ARTIST_TIERS.map((tier) => <option value={tier.id} key={tier.id}>{tier.name} · {tier.price}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`billing-${artist.hostId}`}>Plan status</label>
                <select id={`billing-${artist.hostId}`} value={artist.subscriptionStatus} onChange={(event) => editArtist(artist.hostId, { subscriptionStatus: event.target.value as Artist["subscriptionStatus"] })}>
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="canceled">Canceled</option>
                </select>
              </div>
              <button className="btn secondary" type="button" disabled={savingId === artist.hostId} onClick={() => void saveArtist(artist)}>
                {savingId === artist.hostId ? "Saving..." : "Save"}
              </button>
            </div>
          </article>
        ))}
        {!artists.length && !notice && <p className="muted">No artist accounts yet.</p>}
      </div>
    </section>
  );
}