import Link from "next/link";
import ArtistSignupForm from "./artist-signup-form";

export default function ArtistSignupPage() {
  return (
    <main className="wrap">
      <header className="nav">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          <div className="mark">FI</div>
          <div><div>FAMOUS INTROVERT</div><div className="small">LISTENING ROOMS</div></div>
        </Link>
        <span className="tag">ARTIST SIGN UP</span>
      </header>
      <section className="hero">
        <div className="eyebrow">For independent artists</div>
        <h1>Host your first listen.</h1>
        <p>Choose a tier, sign in with Google, and set up your artist profile.</p>
      </section>
      <ArtistSignupForm />
      <footer className="footer"><Link href="/">Back to listening rooms</Link></footer>
    </main>
  );
}