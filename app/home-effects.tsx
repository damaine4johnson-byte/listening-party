"use client";

import { useEffect } from "react";

// Adds scroll-reveal and a header that tightens on scroll; styling lives in home.module.css via data attributes.
export default function HomeEffects() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (reduced || !("IntersectionObserver" in window)) {
      targets.forEach((el) => el.setAttribute("data-visible", "true"));
    } else {
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-visible", "true");
            observer.unobserve(entry.target);
          }
        }
      }, { threshold: 0.15 });
      targets.forEach((el) => observer.observe(el));
    }

    const header = document.querySelector<HTMLElement>("[data-nav]");
    const onScroll = () => header?.setAttribute("data-scrolled", String(window.scrollY > 24));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    // Invite links jump straight to the entry form.
    if (new URLSearchParams(window.location.search).has("invite")) {
      document.getElementById("enter-room")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    }
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return null;
}
