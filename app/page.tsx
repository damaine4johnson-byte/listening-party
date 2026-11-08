import type { Metadata } from "next";
import Link from "next/link";
import { discoverArtists } from "../lib/discover";
import { LiveNowStrip } from "./stories-row";
import JoinForm from "./join-form";
import LogoMark from "./logo-mark";
import HomeEffects from "./home-effects";
import styles from "./home.module.css";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

export const dynamic = "force-dynamic";

export default async function Home() {
  const liveArtists = (await discoverArtists().catch(() => [])).filter((a) => a.live);
  return (
    <main className={styles.page}>
      <HomeEffects />
      <header className={styles.nav} data-nav>
        <Link href="/" className={styles.brand} aria-label="Famous Introvert Listening Rooms home">
          <LogoMark className={styles.logoImage} />
          <span className={styles.brandText}>
            <span>FAMOUS INTROVERT</span>
            <span>LISTENING ROOMS</span>
          </span>
        </Link>
        <div className={styles.navCenter}>PRIVATE LISTENING SERIES <span>·</span> EST. 2026</div>
        <nav className={styles.authLinks} aria-label="Account">
          <Link className={styles.signIn} href="/signin">Sign in</Link>
          <Link className={styles.signUp} href="/signup">Sign up</Link>
        </nav>
      </header>

      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroPhoto} role="img" aria-label="A recording studio prepared for an exclusive listen" />
        <div className={styles.heroShade} />
        <div className={styles.orbA} aria-hidden="true" />
        <div className={styles.orbB} aria-hidden="true" />
        <div className={styles.eq} aria-hidden="true">
          {Array.from({ length: 28 }, (_, i) => <i key={i} style={{ ["--i" as string]: i }} />)}
        </div>
        <div className={styles.heroContent}>
          <div className={styles.kicker}><span /> EXCLUSIVE LISTENS</div>
          <h1 id="home-title"><span>Listen</span><br /><span className={styles.glow}>Party</span></h1>
          <p>Join a listening room or find an artist to follow.</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="#enter-room">Join with a code</a>
            <Link className={styles.secondaryAction} href="/artists">Find an artist</Link>
          </div>
        </div>
        <div className={styles.heroIndex} aria-hidden="true">FI—001</div>
      </section>

      {liveArtists.length > 0 && (
        <section style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }} aria-label="Live now">
          <h2 style={{ margin: "0 0 10px" }}>🔴 Live now</h2>
          <LiveNowStrip artists={liveArtists} />
        </section>
      )}

      <section className={styles.entry} id="enter-room" aria-labelledby="entry-title">
        <div className={styles.entryHeading}>
          <div className={styles.kickerDark}>LISTENER ACCESS</div>
          <h2 id="entry-title">Join a room</h2>
          <p>Enter your invitation code, or join an artist&apos;s free room from their profile.</p>
          <p className={styles.entryHelp}>No code? <Link href="/artists">Find and follow an artist</Link> to join their free rooms.</p>
        </div>
        <div className={styles.entryForm}>
          <JoinForm />
        </div>
      </section>

      <section className={styles.steps} aria-label="How it works">
        {[
          ["01", "Follow or get invited", "Follow an artist for free-room access, or receive a private code.", "✉"],
          ["02", "Join the room", "Pick a name and step inside in seconds.", "◉"],
          ["03", "Listen together", "Hear the music live, chat, and send tips.", "♫"],
        ].map(([n, title, body, icon], i) => (
          <article key={n} className={styles.step} data-reveal style={{ ["--d" as string]: `${i * 120}ms` }}>
            <span className={styles.stepIcon} aria-hidden="true">{icon}</span>
            <small>{n}</small>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </section>

      <footer className={styles.footer}>
        <span>FAMOUS INTROVERT RECORDS <span className={styles.footerDot}>·</span> PRIVATE BY DESIGN</span>
      </footer>
    </main>
  );
}
