import type { Metadata } from "next";
import Link from "next/link";
import HelpChat from "./help-chat";
import styles from "./help.module.css";

export const metadata: Metadata = {
  title: "Help & Support | Exclusive Listens",
  description: "Get instant answers about listening rooms, artist tools, and listener wallets. Human support is contacted only when needed.",
  alternates: { canonical: "/help" },
  openGraph: { url: "/help" },
};

export default function HelpPage() {
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link className={styles.brand} href="/">EXCLUSIVE LISTENS</Link>
        <nav aria-label="Main navigation">
          <Link href="/about">About</Link>
          <Link href="/">Home</Link>
        </nav>
      </header>
      <section className={styles.intro}>
        <p className={styles.eyebrow}>HELP & SUPPORT</p>
        <h1>How can we help?</h1>
        <p>Ask our AI assistant about listening rooms, artist tools, or listener coins. It will bring in a person only when needed.</p>
      </section>
      <HelpChat />
      <footer className={styles.footer}>
        <span>FAMOUS INTROVERT RECORDS · EXCLUSIVE LISTENS</span>
      </footer>
    </main>
  );
}
