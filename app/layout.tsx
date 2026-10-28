import type { Metadata } from "next";
import { Analytics } from '@vercel/analytics/next';
import SiteMenu from "./site-menu";
import "./globals.css";
import "./brand-theme.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://www.exclusivelisten.com"),
  title: "Listen Party | Famous Introvert",
  description: "Private first-listen experiences from Famous Introvert Records.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><SiteMenu />{children}<Analytics /></body></html>; }
