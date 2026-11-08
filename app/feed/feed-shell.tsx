"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import styles from "../social.module.css";

type Tab = "all" | "following" | "saved";
type Engagement = { likes: Record<string, number>; comments: Record<string, number>; liked: Set<string>; saved: Set<string>; reactions: Record<string, Record<string, number>>; mine: Record<string, string>; signedIn: boolean };
type Ctx = {
  tab: Tab;
  setTab: (tab: Tab) => void;
  following: Set<string>;
  engagement: Engagement;
  visiblePostCount: number;
  loaded: boolean;
  loadError: string;
  reload: () => void;
  toggle: (postId: string, kind: "like" | "save") => Promise<string | null>;
  react: (postId: string, emoji: string) => Promise<string | null>;
};

const EMPTY: Engagement = { likes: {}, comments: {}, liked: new Set(), saved: new Set(), reactions: {}, mine: {}, signedIn: false };
const FeedContext = createContext<Ctx | null>(null);

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Holds the tab, the listener's follows and every post's like/save state so that
// one request serves the whole feed instead of one per card.
export function FeedShell({ postIds, postHosts = {}, tabs = true, children }: { postIds: string[]; postHosts?: Record<string, string | null>; tabs?: boolean; children: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>("all");
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [engagement, setEngagement] = useState<Engagement>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const idsKey = postIds.join(",");

  const load = useCallback(async () => {
    setLoaded(false);
    setLoadError("");
    try {
      const headers = await authHeaders();
      const [engResponse, mineResponse] = await Promise.all([
        fetch(`/api/feed/engagement?posts=${idsKey}`, { headers, cache: "no-store" }),
        fetch("/api/feed/mine", { headers, cache: "no-store" }),
      ]);
      if (!engResponse.ok || !mineResponse.ok) throw new Error("Feed preferences unavailable.");
      const [eng, mine] = await Promise.all([engResponse.json(), mineResponse.json()]);
      setEngagement({ likes: eng.likes ?? {}, comments: eng.comments ?? {}, liked: new Set(eng.liked ?? []), saved: new Set(eng.saved ?? []), reactions: eng.reactions ?? {}, mine: eng.mine ?? {}, signedIn: Boolean(eng.signedIn) });
      setFollowing(new Set(mine.following ?? []));
    } catch {
      setLoadError("Couldn’t load your feed preferences.");
    } finally {
      setLoaded(true);
    }
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

  const react = useCallback(async (postId: string, emoji: string) => {
    if (!engagement.signedIn) return "Sign in with Google to react to posts.";
    const previous = engagement.mine[postId];
    const next = previous === emoji ? undefined : emoji;
    const apply = (from: string | undefined, to: string | undefined) => setEngagement((e) => {
      const counts = { ...(e.reactions[postId] ?? {}) };
      if (from) counts[from] = Math.max(0, (counts[from] ?? 0) - 1);
      if (to) counts[to] = (counts[to] ?? 0) + 1;
      const mine = { ...e.mine };
      if (to) mine[postId] = to; else delete mine[postId];
      return { ...e, reactions: { ...e.reactions, [postId]: counts }, mine };
    });
    apply(previous, next);
    const response = await fetch("/api/feed/engagement", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(next ? { post: postId, action: "react", emoji: next } : { post: postId, action: "unreact" }),
    }).catch(() => null);
    if (!response?.ok) { apply(next, previous); return "Could not save that. Try again."; }
    return null;
  }, [engagement]);

  const visiblePostCount = tab === "all" ? postIds.length : postIds.filter((postId) => (
    tab === "saved"
      ? engagement.saved.has(postId)
      : Boolean(postHosts[postId] && following.has(postHosts[postId] as string))
  )).length;
  const value = useMemo(() => ({ tab, setTab, following, engagement, visiblePostCount, loaded, loadError, reload: load, toggle, react }), [tab, following, engagement, visiblePostCount, loaded, loadError, load, toggle, react]);

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

const REACTION_SET = [["fire", "🔥", "Fire"], ["clap", "👏", "Clap"], ["laugh", "😂", "Laugh"], ["wow", "😮", "Wow"], ["sad", "😢", "Sad"]] as const;

function useFeed() {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error("Feed components must be inside FeedShell");
  return ctx;
}

// Shows a friendly message when a filtered tab has nothing in it.
function TabEmpty() {
  const { tab, setTab, engagement, following, visiblePostCount, loaded, loadError, reload } = useFeed();
  if (!loaded || tab === "all") return null;
  if (loadError) return (
    <div className={styles.empty} role="status">
      <p>{loadError} Your saved and followed posts may be out of date.</p>
      <button className="btn secondary" type="button" onClick={reload}>Try again</button>
    </div>
  );
  if (visiblePostCount > 0) return null;
  if (!engagement.signedIn) {
    return (
      <div className={styles.empty}>
        <p>Sign in to see posts from artists you follow and posts you have saved.</p>
        <div className={styles.emptyActions}>
          <Link className="btn" href="/signin">Sign in</Link>
          <Link className="btn secondary" href="/artists">Find artists</Link>
        </div>
      </div>
    );
  }
  if (tab === "saved") {
    return (
      <div className={styles.empty}>
        <p>{engagement.saved.size === 0 ? "You haven’t saved any posts yet." : "Your saved posts aren’t in the current feed."} Save posts from For you to find them here later.</p>
        <button className="btn secondary" type="button" onClick={() => setTab("all")}>Browse For you</button>
      </div>
    );
  }
  if (following.size === 0) {
    return (
      <div className={styles.empty}>
        <p>You’re not following any artists yet. Follow an artist to see their posts and hear when they open a room.</p>
        <div className={styles.emptyActions}>
          <Link className="btn" href="/artists">Find artists</Link>
          <Link className="btn secondary" href="/discover">Explore Discover</Link>
        </div>
      </div>
    );
  }
  if (tab === "following") return (
    <div className={styles.empty}>
      <p>No recent posts from artists you follow.</p>
      <button className="btn secondary" type="button" onClick={() => setTab("all")}>Browse For you</button>
    </div>
  );
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
  const { engagement, toggle, react } = useFeed();
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

  const counts = engagement.reactions[postId] ?? {};
  const mineEmoji = engagement.mine[postId];

  return (
    <>
    <div className={styles.reactions} role="group" aria-label="React to this post">
      {REACTION_SET.map(([id, symbol, label]) => (
        <button key={id} type="button" className={`${styles.react} ${mineEmoji === id ? styles.on : ""}`} aria-pressed={mineEmoji === id} aria-label={label}
          onClick={async () => { const error = await react(postId, id); if (error) flash(error); }}>
          {symbol}{(counts[id] ?? 0) > 0 && <b>{counts[id]}</b>}
        </button>
      ))}
    </div>
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
    </>
  );
}
