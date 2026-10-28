"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/showcase", label: "The listening room (feed)" },
  { href: "/host", label: "Rooms" },
  { href: "/host/profile", label: "Artist profile" },
  { href: "/profile", label: "Listener profile" },
  { href: "/about", label: "About" },
  { href: "/help", label: "Help & support" },
];

// Site-wide dropdown that replaces the page links that used to sit in the footer.
export default function SiteMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
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

  return (
    <div className="site-menu" ref={box}>
      <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((v) => !v)}>
        ☰ Menu
      </button>
      {open && (
        <nav aria-label="Site pages" role="menu">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} role="menuitem" aria-current={pathname === link.href ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
