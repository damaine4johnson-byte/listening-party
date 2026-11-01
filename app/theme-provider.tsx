"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Light mode only applies to the social pages; the rest of the app is built dark-only.
const SOCIAL = /^\/($|feed|showcase|discover|artists|signin)/;

export function useTheme() {
  const pathname = usePathname();
  const [pref, setPref] = useState<"dark" | "light">("dark");
  useEffect(() => { setPref(localStorage.getItem("theme") === "light" ? "light" : "dark"); }, []);
  const social = SOCIAL.test(pathname);
  const theme = social ? pref : "dark";
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return {
    theme, social,
    toggle: () => { const next = pref === "dark" ? "light" : "dark"; localStorage.setItem("theme", next); setPref(next); },
  };
}

export const THEME_SCRIPT = `try{var p=location.pathname;if(/^\\/($|feed|showcase|discover|artists|signin)/.test(p)&&localStorage.getItem("theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;
