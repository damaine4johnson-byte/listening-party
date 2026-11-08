"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import styles from "./artists.module.css";
import { listenerRoomDestination } from "../../lib/listener-room-return";

const SIGN_IN_ERROR = "Please sign in again to check your follow status.";

async function token() {
  if (!supabase) throw new Error("Listener sign-in is not configured.");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? "";
}

async function loadFollowState(artist: string) {
  const accessToken = await token();
  const response = await fetch(`/api/artists/follow?artist=${encodeURIComponent(artist)}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    cache: "no-store",
  });
  if (response.status === 401) throw new Error(SIGN_IN_ERROR);
  if (!response.ok) throw new Error("Could not check your follow status. Please try again.");
  const data = await response.json();
  if (typeof data.following !== "boolean") throw new Error("Invalid follow status.");
  return data.following;
}

export default function FollowButton({ handle, returnRoomId }: { handle: string; returnRoomId?: string }) {
  const [following, setFollowing] = useState(false);
  const [pending, setPending] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const router = useRouter();
  const returnDestination = listenerRoomDestination(returnRoomId);
  const signupUrl = `/signup?follow=${encodeURIComponent(handle)}${returnDestination && returnRoomId ? `&roomId=${encodeURIComponent(returnRoomId)}` : ""}`;

  useEffect(() => {
    let active = true;
    setPending(true);
    setLoaded(false);
    setError("");
    setSignInRequired(false);
    void loadFollowState(handle).then((value) => {
      if (active) {
        setFollowing(value);
        setLoaded(true);
      }
    }).catch((reason: unknown) => {
      if (active) {
        const message = reason instanceof Error ? reason.message : "Could not check your follow status. Please try again.";
        setError(message);
        setSignInRequired(message === SIGN_IN_ERROR);
      }
    }).finally(() => {
      if (active) setPending(false);
    });
    return () => { active = false; };
  }, [handle]);

  async function toggle() {
    if (pending) return;
    setError("");
    setPending(true);
    try {
      if (!loaded) {
        try {
          setFollowing(await loadFollowState(handle));
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : "Could not check your follow status. Please try again.";
          setError(message);
          setSignInRequired(message === SIGN_IN_ERROR);
          return;
        }
        setLoaded(true);
        setSignInRequired(false);
        return;
      }
      const accessToken = await token();
      if (!accessToken) {
        window.location.assign(signupUrl);
        return;
      }
      const response = await fetch("/api/artists/follow", {
        method: following ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ artist: handle }),
      });
      const d = await response.json().catch(() => ({}));
      if (!response.ok) { setError(d.error || "Could not update."); return; }
      if (typeof d.following !== "boolean") throw new Error("Invalid follow response.");
      setFollowing(d.following);
      if (d.following && returnDestination) {
        window.location.assign(returnDestination);
        return;
      }
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
        {pending ? "Please wait..." : !loaded ? "Retry" : following ? "Following ✓" : "Follow"}
      </button>
      {error && <p role="alert" className={styles.muted}>{error}</p>}
      {signInRequired && <Link href={signupUrl}>Sign in to follow</Link>}
      {loaded && following && returnDestination && <p className={styles.muted}><Link href={returnDestination}>Return to room</Link></p>}
    </div>
  );
}
