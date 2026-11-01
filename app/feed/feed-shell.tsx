"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import styles from "../social.module.css";

type Tab = "all" | "following" | "saved";
type Engagement = { likes: Record<string, number>; comments: Record<string, number>; liked: Set<string>; saved: Set<string>; signedIn: boolean };
type Ctx = {
  tab: Tab;
  following: Set<string>;
  engagement: Engagement;
  toggle: (postId: string, kind: "like" | "save") => Promise<string | null>;
};

const EMPTY: Engagement = { likes: {}, comments: {}, liked: new Set(), saved: new Set(), signedIn: false };
const FeedContext = createContext<Ctx | null>(null);

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Holds the tab, the listener's follows and every post's like/save state so that
// one request serves the whole feed instead of one per card.
export function FeedShell({ postIds, tabs = true, children }: { postIds: string[]; tabs?: boolean; children: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>("all");
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [engagement, setEngagement] = useState<Engagement>(EMPTY);
  const idsKey = postIds.join(",");

  const load = useCallback(async () => {
    const headers = await authHeaders();
    const [eng, mine] = await Promise.all([
      fetch(`/api/feed/engagement?posts=${idsKey}`, { headers, cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/feed/mine", { headers, cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]);
    if (eng) setEngagement({ likes: eng.likes ?? {}, comments: eng.comments ?? {}, liked: new Set(eng.liked ?? []), saved: new Set(eng.saved ?? []), signedIn: Boolean(eng.signedIn) });
    if (mine) setFollowing(new Set(mine.following ?? []));
  }, [idsKey]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const { data } = supabase?.auth.onAuthStateChange(() => { void load(); }) ?? { data: null };
    return () => data?.subscription.unsubscribe();
  }, [load]);

  const toggle = useCallback(async (postId: string, kind: "like" | "save") => {
    if (!engagement.signedIn) return "Sign in with Google to like or save posts.";
    const set = kind === "like" ? engagement.liked : engagement.saved;
    const on = !set.has(postId);
    const apply = (value: boolean) => setEngagement((e) => {
      const next = new Set(kind === "like" ? e.liked : e.saved);
      if (value) next.add(postId); else next.delete(postId);
      const likes = kind === "like" ? { ...e.likes, [postId]: Math.max(0, (e.likes[postId] ?? 0) + (value ? 1 : -1)) } : e.likes;
      return { ...e, likes, liked: kind === "like" ? next : e.liked, saved: kind === "save" ? next : e.saved };
    });
    apply(on);
    const response = await fetch("/api/feed/engagement", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ post: postId, action: kind === "like" ? (on ? "like" : "unlike") : (on ? "save" : "unsave") }),
    }).catch(() => null);
    if (!response?.ok) { apply(!on); return "Could not save that. Try again."; }
    return null;
  }, [engagement]);

  const value = useMemo(() => ({ tab, following, engagement, toggle }), [tab, following, engagement, toggle]);

  return (
    <FeedContext.Provider value={value}>
      {tabs && (
        <div className={styles.tabs} role="tablist" aria-label="Feed filter">
          {([["all", "For you"], ["following", "Following"], ["saved", "Saved"]] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" className={styles.tab} aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      )}
      {children}
      <TabEmpty />
    </FeedContext.Provider>
  );
}

function useFeed() {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error("Feed components must be inside FeedShell");
  return ctx;
}

// Shows a friendly message when a filtered tab has nothing in it.
function TabEmpty() {
  const { tab, engagement, following } = useFeed();
  if (tab === "all") return null;
  if (!engagement.signedIn) return <p className={styles.empty}>Sign in with Google to see your {tab === "saved" ? "saved posts" : "followed artists"}.</p>;
  if (tab === "saved" && engagement.saved.size === 0) return <p className={styles.empty}>Tap 🔖 on a post to save it for later.</p>;
  if (tab === "following" && following.size === 0) return <p className={styles.empty}>You are not following any artists yet. Find some in Discover.</p>;
  return null;
}

// Hides a post when it does not belong to the active tab.
export function FeedItem({ postId, hostKey, children }: { postId: string; hostKey: string | null; children: React.ReactNode }) {
  const { tab, following, engagement } = useFeed();
  if (tab === "following" && !(hostKey && following.has(hostKey))) return null;
  if (tab === "saved" && !engagement.saved.has(postId)) return null;
  return <>{children}</>;
}

export function PostActions({ postId, shareTitle, onComments, commentsOpen }: { postId: string; shareTitle: string; onComments: () => void; commentsOpen: boolean }) {
  const { engagement, toggle } = useFeed();
  const [toast, setToast] = useState("");
  const [pop, setPop] = useState(false);
  const liked = engagement.liked.has(postId);
  const saved = engagement.saved.has(postId);

  function flash(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2200); }

  async function like() {
    setPop(true); window.setTimeout(() => setPop(false), 400);
    const error = await toggle(postId, "like");
    if (error) flash(error);
  }
  async function save() {
    const error = await toggle(postId, "save");
    flash(error ?? (saved ? "Removed from saved" : "Saved for later"));
  }
  async function share() {
    const url = `${window.location.origin}/feed#post-${postId}`;
    try {
      if (navigator.share) await navigator.share({ title: shareTitle, url });
      else { await navigator.clipboard.writeText(url); flash("Link copied"); }
    } catch { /* share dismissed */ }
  }

  return (
    <div className={styles.actions}>
      <button type="button" className={`${styles.act} ${liked ? styles.on : ""} ${pop ? styles.pop : ""}`} aria-pressed={liked} aria-label={liked ? "Unlike" : "Like"} onClick={() => void like()}>
        {liked ? "♥" : "♡"} {(engagement.likes[postId] ?? 0) > 0 && engagement.likes[postId]}
      </button>
      <button type="button" className={styles.act} aria-expanded={commentsOpen} onClick={onComments}>
        💬 {(engagement.comments[postId] ?? 0) > 0 && engagement.comments[postId]}
      </button>
      <button type="button" className={styles.act} onClick={() => void share()} aria-label="Share link">↗ Share</button>
      <span className={styles.spacer} />
      <button type="button" className={`${styles.act} ${saved ? styles.saved : ""}`} aria-pressed={saved} aria-label={saved ? "Remove from saved" : "Save post"} onClick={() => void save()}>
        {saved ? "🔖" : "🏷"}
      </button>
      {toast && <span className={styles.toast} role="status">{toast}</span>}
    </div>
  );
}
