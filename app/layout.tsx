import type { Metadata } from "next";
import { Analytics } from '@vercel/analytics/next';
import "./globals.css";
import "./brand-theme.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://www.exclusivelisten.com"),
  title: "Listen Party | Famous Introvert",
  description: "Private first-listen experiences from Famous Introvert Records.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}<Analytics /></body></html>; }
