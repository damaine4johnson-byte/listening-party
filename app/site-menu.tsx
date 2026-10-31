"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";
import NotificationBell from "./notification-bell";
import styles from "./site-menu.module.css";

type Viewer = {
  kind: "artist" | "listener";
  name: string;
  avatarUrl: string;
  handle: string | null;      // artist: username; listener: null
  hostId: string | null;      // artist only
  balanceCoins: number | null;
};

const EMPTY: Viewer = { kind: "listener", name: "", avatarUrl: "", handle: null, hostId: null, balanceCoins: null };

// Twitter-style dropdown: each member sees their own profile header with avatar
// at the top, then a role-aware list of destinations.
export default function SiteMenu() {
  const [open, setOpen] = useState(false);
  const [viewer, setViewer] = useState<Viewer>(EMPTY);
  const [ready, setReady] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((_e, session) => { void load(session?.access_token ?? ""); });
    void supabase.auth.getSession().then(({ data: d }) => { if (active) void load(d.session?.access_token ?? ""); });
    return () => { active = false; data.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async (token: string) => {
    if (!token) { setViewer(EMPTY); setReady(true); return; }
    // Listener data (wallet balance + listener profile).
    let next: Viewer = EMPTY;
    try {
      const [profileRes, balanceRes] = await Promise.all([
        fetch("/api/listeners/profile", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
        fetch("/api/coins/balance", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
      ]);
      if (profileRes.ok) {
        const p = await profileRes.json();
        next = {
          kind: "listener",
          name: p.profile?.displayName || (p.email ? p.email.split("@")[0] : "Listener"),
          avatarUrl: p.profile?.avatarUrl || "",
          handle: null, hostId: null,
          balanceCoins: balanceRes.ok ? (await balanceRes.json()).balance ?? 0 : null,
        };
      }
    } catch { /* fall through to signed-out view */ }

    // Is this listener also an artist (host cookie session)? Ask the host API.
    try {
      const hostRes = await fetch("/api/host/profile", { cache: "no-store" });
      if (hostRes.ok) {
        const h = await hostRes.json();
        next = {
          kind: "artist",
          name: h.profile?.display_name || h.handle || "Artist",
          avatarUrl: h.profile?.avatar_url || "",
          handle: h.handle ?? null,
          hostId: h.handle ? h.handle : null,
          balanceCoins: next.balanceCoins,
        };
      }
    } catch { /* listener view stands */ }

    if (activeCheck()) { setViewer(next); setReady(true); }
    function activeCheck() { return Boolean(supabase); }
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.type === "keydown" && (event as KeyboardEvent).key !== "Escape") return;
      if (event.type === "pointerdown" && box.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const signedIn = viewer.name !== "" || viewer.kind === "artist";
  const profileHref = viewer.kind === "artist" && viewer.handle ? `/artists/${viewer.handle}` : "/profile";
  const initials = (viewer.name || "?").charAt(0).toUpperCase();

  const links = viewer.kind === "artist"
    ? [
      { href: profileHref, label: "Profile", icon: "👤" },
      { href: "/feed", label: "Feed", icon: "▦" },
      { href: "/host", label: "Rooms", icon: "🎧" },
      { href: "/bank", label: "Balance", icon: "💰" },
      { href: "/host/profile", label: "Settings", icon: "⚙️" },
      { href: "/about", label: "About", icon: "ⓘ" },
    ]
    : [
      { href: profileHref, label: "Profile", icon: "👤" },
      { href: "/feed", label: "Feed", icon: "▦" },
      { href: "/bank", label: "Balance", icon: "💰" },
      { href: "/wallet", label: "Buy coins", icon: "🪙" },
      { href: "/help", label: "Help & support", icon: "ⓘ" },
      { href: "/about", label: "About", icon: "ⓘ" },
    ];

  return (
    <div className={styles.bar} ref={box}>
      <div className={styles.left} />
      <div className={styles.right}>
        <NotificationBell />
        <button type="button" className={styles.trigger} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((v) => !v)}>
          {viewer.avatarUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img className={styles.triggerAvatar} src={viewer.avatarUrl} alt="" />
            : <span className={styles.triggerAvatarFallback}>{signedIn ? initials : "☰"}</span>}
        </button>
        {open && (
          <nav className={styles.panel} aria-label="Account menu" role="menu">
            {signedIn ? (
              <Link className={styles.header} href={profileHref} role="menuitem">
                {viewer.avatarUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img className={styles.headerAvatar} src={viewer.avatarUrl} alt="" />
                  : <span className={styles.headerAvatarFallback}>{initials}</span>}
                <span className={styles.headerText}>
                  <strong>{viewer.name || "Your profile"}</strong>
                  {viewer.kind === "artist"
                    ? <em>Artist profile · @{viewer.handle ?? "set up your username"}</em>
                    : <em>Listener profile</em>}
                </span>
              </Link>
            ) : (
              <Link className={styles.header} href="/signin" role="menuitem">
                <span className={styles.headerAvatarFallback}>+</span>
                <span className={styles.headerText}><strong>Sign in</strong><em>Listener or artist</em></span>
              </Link>
            )}
            <div className={styles.divider} />
            {!ready ? (
              <span className={styles.itemLoading}>Loading…</span>
            ) : (
              links.map((link) => (
                <Link key={link.href} href={link.href} role="menuitem" className={styles.item} aria-current={pathname === link.href ? "page" : undefined}>
                  <span className={styles.icon} aria-hidden>{link.icon}</span>{link.label}
                  {link.label === "Balance" && viewer.balanceCoins !== null && (
                    <span className={styles.pill}>{viewer.balanceCoins.toLocaleString()} 🪙</span>
                  )}
                </Link>
              ))
            )}
            {signedIn && (
              <>
                <div className={styles.divider} />
                <button type="button" role="menuitem" className={styles.item} onClick={() => { setOpen(false); void supabase?.auth.signOut().then(() => window.location.assign("/")); }}>
                  <span className={styles.icon} aria-hidden>↩</span>Sign out
                </button>
              </>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
