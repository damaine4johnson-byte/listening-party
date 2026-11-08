import type { Metadata } from "next";
import { Analytics } from '@vercel/analytics/next';
import SiteMenu from "./site-menu";
import "./globals.css";
import "./brand-theme.css";
import "./theme-v2.css";
import BottomTabs from "./bottom-tabs";
import { THEME_SCRIPT } from "./theme-provider";
export const metadata: Metadata = {
  metadataBase: new URL("https://www.exclusivelisten.com"),
  title: "Listen Party | Famous Introvert",
  description: "Private first-listen experiences from Famous Introvert Records.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head><body className="has-tabs"><a className="skip-link" href="#main-content">Skip to main content</a><SiteMenu /><div id="main-content" tabIndex={-1}>{children}</div><BottomTabs /><Analytics /></body></html>; }
