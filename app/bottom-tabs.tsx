"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./bottom-tabs.module.css";

const TABS = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/discover", label: "Discover", icon: "🔎" },
  { href: "/feed", label: "Feed", icon: "📰" },
  { href: "/artists", label: "Artists", icon: "🎤" },
  { href: "/profile", label: "Profile", icon: "👤" },
];

export default function BottomTabs() {
  const pathname = usePathname();
  if (pathname.startsWith("/room") || pathname.startsWith("/admin")) return null;
  return (
    <nav className={styles.tabs} aria-label="Main">
      {TABS.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return <Link key={t.href} href={t.href} className={active ? styles.active : ""}><span>{t.icon}</span>{t.label}</Link>;
      })}
    </nav>
  );
}
