"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import styles from "./artists.module.css";

export default function FollowButton({ handle }: { handle: string }) {
  const [following, setFollowing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function token() {
    return (await supabase?.auth.getSession())?.data.session?.access_token ?? "";
  }

  useEffect(() => {
    void (async () => {
      const t = await token();
      const response = await fetch(`/api/artists/follow?artist=${handle}`, { headers: t ? { Authorization: `Bearer ${t}` } : {}, cache: "no-store" });
      if (!response.ok) return;
      const d = await response.json();
      setFollowing(d.following);
    })();
  }, [handle]);

  async function toggle() {
    let accessToken = "";
    try {
      accessToken = await token();
    } catch {
      setError("Could not check your sign-in status. Please try again.");
      return;
    }
    if (!accessToken) {
      window.location.assign(`/signup?follow=${encodeURIComponent(handle)}`);
      return;
    }
    setError(""); setPending(true);
    try {
      const response = await fetch("/api/artists/follow", {
        method: following ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ artist: handle }),
      });
      const d = await response.json().catch(() => ({}));
      if (!response.ok) { setError(d.error || "Could not update."); return; }
      setFollowing(d.following);
      router.refresh();
    } catch {
      setError("Could not update your follow. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button className={`${styles.follow} ${following ? styles.on : ""}`} type="button" disabled={pending} onClick={() => void toggle()}>
        {following ? "Following ✓" : "Follow"}
      </button>
      {error && <p role="alert" className={styles.muted}>{error}</p>}
    </div>
  );
}
