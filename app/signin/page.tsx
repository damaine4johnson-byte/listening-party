import Link from "next/link";
import LogoMark from "../logo-mark";
import ListenerSigninForm from "./listener-signin-form";
import styles from "./signin.module.css";

export const metadata = { title: "Sign in · Famous Introvert" };

export default function ListenerSigninPage() {
  return (
    <main className={styles.page}>
      <div className={styles.media} aria-hidden="true">
        <video
          className={styles.video}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=2200&q=85"
        >
          <source src="https://videos.pexels.com/video-files/35323903/14966336_1080_1920_30fps.mp4" type="video/mp4" />
        </video>
        <div className={styles.scrim} />
        <div className={styles.equalizer}>
          {Array.from({ length: 28 }, (_, index) => <i key={index} style={{ ["--bar" as string]: index }} />)}
        </div>
      </div>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand} aria-label="Famous Introvert Listening Rooms home">
          <LogoMark className={styles.logo} />
          <span><b>FAMOUS INTROVERT</b><small>LISTENING ROOMS</small></span>
        </Link>
        <span className={styles.navLabel}>ACCOUNT ACCESS <i /> PRIVATE BY DESIGN</span>
        <Link className={styles.createLink} href="/signup">Create account <span aria-hidden="true">↗</span></Link>
      </header>
      <section className={styles.main} aria-labelledby="signin-title">
        <div className={styles.intro}>
          <p className={styles.eyebrow}><span /> ONE SIGN-IN · EVERY ROOM</p>
          <h1 id="signin-title">Welcome<br />to the <em>room.</em></h1>
          <p className={styles.description}>Sign in with your Google account. We’ll find your profile and take you where you belong.</p>
          <div className={styles.roles} aria-label="Account types">
            <div className={styles.role}>
              <span className={styles.roleIndex}>01 / HOST</span>
              <strong>Share your sound</strong>
              <span>Artist profile · private rooms · playlists</span>
            </div>
            <div className={styles.role}>
              <span className={styles.roleIndex}>02 / LISTENER</span>
              <strong>Find your people</strong>
              <span>Invited rooms · chat · your wallet</span>
            </div>
          </div>
        </div>
        <ListenerSigninForm />
      </section>
      <footer className={styles.footer}>
        <span>FAMOUS INTROVERT RECORDS</span>
        <span>EXCLUSIVE LISTENS · EST. 2026</span>
      </footer>
    </main>
  );
}
