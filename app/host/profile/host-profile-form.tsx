"use client";

import { FormEvent, useEffect, useState } from "react";
import { ARTIST_TIERS, type ArtistTier } from "../../../lib/artist-tiers";
import { AvatarCropper } from "./avatar-cropper";
import styles from "./edit-profile.module.css";

type HostProfile = {
  display_name: string;
  bio: string;
  avatar_url: string;
  contact_email: string;
  plan_tier: ArtistTier;
  subscription_status: string;
};

type HostAccount = {
  auth_provider: "password" | "google";
  account_identity: string;
};

const emptyProfile: HostProfile = {
  display_name: "",
  bio: "",
  avatar_url: "",
  contact_email: "",
  plan_tier: "free",
  subscription_status: "active",
};

export default function HostProfileForm() {
  const [profile, setProfile] = useState(emptyProfile);
  const [account, setAccount] = useState<HostAccount | null>(null);
  const [followers, setFollowers] = useState(0);
  const [handle, setHandle] = useState("");
  const [username, setUsername] = useState("");
  const [notice, setNotice] = useState("Loading profile...");
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/host/profile", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load profile.");
        if (!active) return;
        setProfile(result.profile);
        setAccount(result.account);
        setFollowers(typeof result.followers === "number" ? result.followers : 0);
        setHandle(typeof result.handle === "string" ? result.handle : "");
        setUsername(typeof result.username === "string" ? result.username : "");
        setNotice("");
      })
      .catch((error: unknown) => {
        if (active) setNotice(error instanceof Error ? error.message : "Could not load profile.");
      });
    return () => { active = false; };
  }, []);

  function update<K extends keyof HostProfile>(key: K, value: HostProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function uploadAvatar(blob: Blob) {
    setCropFile(null);
    setUploading(true);
    setNotice("");
    try {      const response = await fetch("/api/host/profile/avatar", { method: "POST", body: blob });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not upload picture.");
      update("avatar_url", result.url);
      setNotice("Picture uploaded. Save your profile to keep it.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not upload picture.");
    } finally {
      setUploading(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNotice("");
    try {
      const response = await fetch("/api/host/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: profile.display_name,
          bio: profile.bio,
          avatarUrl: profile.avatar_url,
          contactEmail: profile.contact_email,
          planTier: profile.plan_tier,
          ...(username ? { username } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save profile.");
      if (username) setHandle(username);
      setNotice("Profile saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save profile.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save}>
      <div className="grid">
        <section className="panel" aria-labelledby="public-profile-title">
          <div className={styles.head}>
            <label className={styles.ring} htmlFor="avatar-file" title="Change profile photo">
              {profile.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img className={styles.avatar} src={profile.avatar_url} alt="Your profile photo" />
                : <span className={styles.avatar}>{(profile.display_name || "?").charAt(0).toUpperCase()}</span>}
              <span className={styles.cam} aria-hidden>📷</span>
            </label>
            <div className={styles.main}>
              <h2 id="public-profile-title" className={styles.username}>{username || handle || profile.display_name || "Your profile"}</h2>
              <div className={styles.stats}>
                <span><strong>{followers.toLocaleString()}</strong> {followers === 1 ? "follower" : "followers"}</span>
              </div>
              <div className={styles.actions}>
                {handle && <a href={`/artists/${handle}`}>View public profile</a>}
                {profile.avatar_url && <button type="button" onClick={() => update("avatar_url", "")}>Remove photo</button>}
              </div>
            </div>
          </div>
          <div className={styles.bioBlock}>
            <b>{profile.display_name || "Your name"}</b>
            {profile.bio && <p>{profile.bio}</p>}
          </div>
          <h3 className={styles.editTitle}>Edit profile</h3>
          <div className="field">
            <label htmlFor="display-name">Display name</label>
            <input
              id="display-name"
              value={profile.display_name}
              onChange={(event) => update("display_name", event.target.value)}
              maxLength={80}
              required
            />
          </div>
          {(
            <div className="field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                minLength={3}
                maxLength={24}
              />
              <p className="muted">Your public link: /artists/{username}</p>
            </div>
          )}
          <div className="field">
            <label htmlFor="bio">Bio</label>
            <textarea
              id="bio"
              value={profile.bio}
              onChange={(event) => update("bio", event.target.value)}
              maxLength={400}
              rows={5}
            />
          </div>
          <input
            id="avatar-file"
            className={styles.hidden}
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(event) => { setCropFile(event.target.files?.[0] ?? null); event.target.value = ""; }}
          />
          {cropFile && <AvatarCropper file={cropFile} onCancel={() => setCropFile(null)} onDone={(blob) => void uploadAvatar(blob)} />}
          <span className="small">{uploading ? "Uploading..." : "Tap your photo to change it, then save your profile."}</span>
        </section>

        <section className="panel" aria-labelledby="private-account-title">
          <h2 id="private-account-title">Private account details</h2>
          <div className="field">
            <label htmlFor="account-identity">Sign-in identity</label>
            <input
              id="account-identity"
              value={account ? `${account.account_identity} (${account.auth_provider})` : ""}
              readOnly
            />
          </div>
          <div className="field">
            <label htmlFor="contact-email">Contact email</label>
            <input
              id="contact-email"
              type="email"
              autoComplete="email"
              value={profile.contact_email}
              onChange={(event) => update("contact_email", event.target.value)}
              maxLength={320}
            />
          </div>
          <p className="small">Account identity and contact email are visible only in the host console.</p>
        </section>
      </div>

      <section style={{ marginTop: 20 }} aria-labelledby="artist-tier-title">
        <h2 id="artist-tier-title">Artist tier</h2>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {ARTIST_TIERS.map((tier) => (
            <label className="panel" key={tier.id} style={{ cursor: "pointer", borderColor: profile.plan_tier === tier.id ? "var(--red)" : undefined }}>
              <span className="row" style={{ justifyContent: "space-between" }}>
                <strong>{tier.name}</strong>
                <input
                  type="radio"
                  name="artist-tier"
                  checked={profile.plan_tier === tier.id}
                  onChange={() => setProfile((current) => ({ ...current, plan_tier: tier.id }))}
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
              {tier.id !== "free" && <span className="small">Paid capacity activates after billing is connected.</span>}
            </label>
          ))}
        </div>
        {profile.plan_tier !== "free" && profile.subscription_status !== "active" && (
          <p className="small" role="status">Paid tier selected; billing is pending. Rooms currently use the free 100-listener cap and show ads.</p>
        )}
        {profile.subscription_status === "active" && profile.plan_tier !== "free" && (
          <p className="small" role="status">Your paid tier is active.</p>
        )}
      </section>

      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn" type="submit" disabled={pending || !account}>
          {pending ? "Saving..." : "Save profile"}
        </button>
        {notice && <p className="small" role="status">{notice}</p>}
      </div>
    </form>
  );
}