import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Famous Introvert Listening Rooms", description: "Private first-listen experiences from Famous Introvert Records." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
