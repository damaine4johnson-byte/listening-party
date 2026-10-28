import Link from "next/link";
import LogoMark from "../logo-mark";
import ListenerSigninForm from "./listener-signin-form";

export const metadata = { title: "Listener sign-in · Famous Introvert" };

export default function ListenerSigninPage() {
  return (
    <main className="wrap">
      <header className="nav">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          <LogoMark />
          <div><div>FAMOUS INTROVERT</div><div className="small">LISTENING ROOMS</div></div>
        </Link>
        <span className="tag">LISTENER SIGN-IN</span>
      </header>
      <section className="hero">
        <div className="eyebrow">For listeners</div>
        <h1>Keep your wallet and chat photo everywhere.</h1>
        <p>One Google account holds your coins, your profile, and your seat in the room.</p>
      </section>
      <ListenerSigninForm />
      <footer className="footer"><Link href="/">Back to listening rooms</Link></footer>
    </main>
  );
}
