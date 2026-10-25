import Link from "next/link";
import JoinForm from "./join-form";
import LogoMark from "./logo-mark";
import styles from "./home.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand} aria-label="Famous Introvert Listening Rooms home">
          <LogoMark className={styles.logoImage} />
          <span className={styles.brandText}>
            <span>FAMOUS INTROVERT</span>
            <span>LISTENING ROOMS</span>
          </span>
        </Link>
        <div className={styles.navCenter}>PRIVATE LISTENING SERIES <span>·</span> EST. 2026</div>
        <Link className={styles.artistLink} href="/showcase">See the room <span aria-hidden="true">↗</span></Link>
      </header>

      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroPhoto} role="img" aria-label="A recording studio prepared for a private first listen" />
        <div className={styles.heroShade} />
        <div className={styles.heroContent}>
          <div className={styles.kicker}><span /> PRIVATE FIRST LISTENS</div>
          <h1 id="home-title">Listen<br />Party</h1>
          <p>Your private first listen, shared in real time.</p>
          <div className={styles.heroRule} />
          <div className={styles.heroFoot}>
            <span>RECORDS / LISTENING ROOMS</span>
            <a href="#enter-room">Enter a room <span aria-hidden="true">↓</span></a>
          </div>
        </div>
        <div className={styles.heroIndex} aria-hidden="true">FI—001</div>
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
        <nav aria-label="Footer">
          <Link href="/showcase">The listening room</Link>
          <Link href="/host">Host access</Link>
          <Link href="/signup">Artist access</Link>
        </nav>
      </footer>
    </main>
  );
}
