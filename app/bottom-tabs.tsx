"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./bottom-tabs.module.css";

const TABS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/discover", label: "Discover", icon: "discover" },
  { href: "/feed", label: "Feed", icon: "feed" },
  { href: "/artists", label: "Artists", icon: "artists" },
  { href: "/profile", label: "Profile", icon: "profile" },
];

function TabIcon({ name }: { name: (typeof TABS)[number]["icon"] }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "home" && <><path d="m3.5 10 8.5-7 8.5 7" /><path d="M5.5 9v11h13V9M9.5 20v-6h5v6" /></>}
      {name === "discover" && <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>}
      {name === "feed" && <><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>}
      {name === "artists" && <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5a5.5 5.5 0 0 1 11 0V20zM16 5.5a3 3 0 0 1 0 5.8M17 14a4.5 4.5 0 0 1 3.5 4.4V20h-3" /></>}
      {name === "profile" && <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>}
    </svg>
  );
}

export default function BottomTabs() {
  const pathname = usePathname();
  if (pathname.startsWith("/room") || pathname.startsWith("/admin")) return null;
  return (
    <nav className={styles.tabs} aria-label="Main">
      {TABS.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return <Link key={t.href} href={t.href} className={active ? styles.active : ""} aria-current={active ? "page" : undefined}><span className={styles.icon}><TabIcon name={t.icon} /></span>{t.label}</Link>;
      })}
    </nav>
  );
}
