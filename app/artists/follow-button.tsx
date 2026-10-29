"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import styles from "./artists.module.css";

export default function FollowButton({ handle, initialFollowers }: { handle: string; initialFollowers: number }) {
  const [followers, setFollowers] = useState(initialFollowers);
  const [following, setFollowing] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function token() {
    return (await supabase?.auth.getSession())?.data.session?.access_token ?? "";
  }

  useEffect(() => {
    void (async () => {
      const t = await token();
      const response = await fetch(`/api/artists/follow?artist=${handle}`, { headers: t ? { Authorization: `Bearer ${t}` } : {}, cache: "no-store" });
      if (!response.ok) return;
      const d = await response.json();
      setFollowing(d.following); setSignedIn(d.signedIn); setFollowers(d.followers);
    })();
  }, [handle]);

  async function toggle() {
    setError(""); setPending(true);
    const response = await fetch("/api/artists/follow", {
      method: following ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ artist: handle }),
    });
    const d = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) { setError(d.error || "Could not update."); return; }
    setFollowing(d.following); setFollowers(d.followers);
  }

  return (
    <div>
      <div className={styles.followers}>{followers.toLocaleString()} {followers === 1 ? "follower" : "followers"}</div>
      {signedIn === false ? (
        <p className={styles.muted}><Link href="/signin">Sign in</Link> to follow and get notified when this artist opens a room.</p>
      ) : (
        <button className={`${styles.follow} ${following ? styles.on : ""}`} type="button" disabled={pending || signedIn === null} onClick={() => void toggle()}>
          {following ? "Following ✓" : "Follow"}
        </button>
      )}
      {error && <p role="alert" className={styles.muted}>{error}</p>}
    </div>
  );
}
