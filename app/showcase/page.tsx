import type { Metadata } from "next";
import Link from "next/link";
import LogoMark from "../logo-mark";
import styles from "../home.module.css";

export const metadata: Metadata = {
  title: "The Listening Room | Famous Introvert",
  description: "Discover private, shared first-listen sessions from Famous Introvert Records.",
  alternates: { canonical: "/showcase" },
  openGraph: { url: "/showcase" },
};

export default function ShowcasePage() {
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
        <Link className={styles.artistLink} href="/#enter-room">Enter with an invite <span aria-hidden="true">↗</span></Link>
      </header>

      <section className={styles.showcase} aria-labelledby="showcase-title">
        <div className={styles.showcaseIntro}>
          <div className={styles.kickerDark}>INSIDE THE LISTENING ROOM <span>01 / 03</span></div>
          <h1 id="showcase-title">A first listen,<br />felt together.</h1>
          <p>A private space for an artist to share what comes next, and for their people to hear it at the same moment.</p>
        </div>

        <div className={styles.roomPreview} aria-label="Preview of a private listening room">
          <div className={styles.roomBar}>
            <span className={styles.roomBrand}><LogoMark className={styles.roomLogo} /> FI LISTENING ROOM</span>
            <span className={styles.liveStatus}><i /> LIVE SESSION</span>
          </div>
          <div className={styles.roomBody}>
            <div className={styles.albumArt} role="img" aria-label="Artist performing beneath a spotlight">
              <span className={styles.albumEyebrow}>FAMOUS INTROVERT PRESENTS</span>
              <span className={styles.albumTitle}>AFTER<br />THE LIGHTS</span>
              <span className={styles.albumCaption}>A PRIVATE FIRST LISTEN · SIDE A</span>
            </div>
            <div className={styles.roomDetails}>
              <div className={styles.roomMeta}><span>NOW PLAYING</span><span>01 — 08</span></div>
              <h2>Blue Hour</h2>
              <p>New music, heard together for the first time.</p>
              <div className={styles.trackProgress} aria-hidden="true"><span /></div>
              <div className={styles.trackTime}><span>01:42</span><span>03:18</span></div>
              <div className={styles.roomPeople}>
                <div><span className={styles.listenerCount}>08</span><span>IN THE ROOM</span></div>
                <div className={styles.listenerMarks} aria-hidden="true"><i>J</i><i>M</i><i>A</i><i>+</i></div>
              </div>
              <div className={styles.roomMessage}><span>Jules</span> That last note. wow.</div>
            </div>
          </div>
          <div className={styles.roomPlayer} aria-hidden="true">
            <span className={styles.playMark}>▶</span>
            <span className={styles.waveform}><i /></span>
            <span className={styles.playerTime}>01:42</span>
          </div>
        </div>

        <div className={styles.showcaseSteps}>
          <article>
            <span>01 / INVITE</span>
            <h2>Only your people.</h2>
            <p>Every room starts with a private invitation. The guest list is yours.</p>
          </article>
          <article>
            <span>02 / LISTEN</span>
            <h2>One shared moment.</h2>
            <p>Press play together, follow the music, and let the first reaction happen live.</p>
          </article>
          <article>
            <span>03 / CONNECT</span>
            <h2>Stay in the room.</h2>
            <p>Talk, react, and be there with the artist while the music unfolds.</p>
          </article>
        </div>

        <div className={styles.showcaseCta}>
          <div>
            <span>YOUR INVITATION IS THE KEY</span>
            <h2>Come in and listen.</h2>
          </div>
          <Link href="/#enter-room" className={styles.showcaseCtaLink}>Enter with an invite <span aria-hidden="true">↗</span></Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>FAMOUS INTROVERT RECORDS <span className={styles.footerDot}>·</span> PRIVATE BY DESIGN</span>
      </footer>
    </main>
  );
}