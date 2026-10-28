import Link from "next/link";
import ArtistSignupForm from "./artist-signup-form";
import LogoMark from "../logo-mark";

export default function ArtistSignupPage() {
  return (
    <main className="wrap">
      <header className="nav">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          <LogoMark />
          <div><div>FAMOUS INTROVERT</div><div className="small">LISTENING ROOMS</div></div>
        </Link>
        <span className="tag">ARTIST SIGN UP</span>
      </header>
      <section className="hero">
        <div className="eyebrow">Sign up</div>
        <h1>Listen, or host your own room.</h1>
        <p>Choose how you want to use Famous Introvert, then sign in with Google.</p>
      </section>
      <ArtistSignupForm />
    </main>
  );
}