import type { Metadata } from "next";
import Link from "next/link";
import JoinForm from "./join-form";
import LogoMark from "./logo-mark";
import HomeEffects from "./home-effects";
import styles from "./home.module.css";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

export default function Home() {
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
          <Link className={styles.signIn} href="/host">Sign in</Link>
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
          <p>Your exclusive listen, shared in real time.</p>
          <div className={styles.heroRule} />
          <div className={styles.heroFoot}>
            <span>RECORDS / LISTENING ROOMS</span>
            <a href="#enter-room">Enter a room <span aria-hidden="true">↓</span></a>
          </div>
        </div>
        <div className={styles.heroIndex} aria-hidden="true">FI—001</div>
      </section>

      <section className={styles.steps} aria-label="How it works">
        {[
          ["01", "Get invited", "Receive a private code from the artist.", "✉"],
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

      <section className={styles.entry} id="enter-room" aria-labelledby="entry-title">
        <div className={styles.entryHeading}>
          <div className={styles.kickerDark}>LISTENER ACCESS <span>01 / 02</span></div>
          <h2 id="entry-title">Step inside.</h2>
          <p>Your invitation is the key.</p>
        </div>
        <div className={styles.entryForm}>
          <JoinForm />
        </div>
      </section>

      <footer className={styles.footer}>
        <span>FAMOUS INTROVERT RECORDS <span className={styles.footerDot}>·</span> PRIVATE BY DESIGN</span>
      </footer>
    </main>
  );
}
