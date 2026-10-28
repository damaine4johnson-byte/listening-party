import Link from "next/link";
import LogoMark from "../logo-mark";
import ListenerProfileClient from "./listener-profile-client";

export const metadata = { title: "Your profile · Famous Introvert" };

export default function ListenerProfilePage() {
  return (
    <main className="wrap">
      <header className="nav">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          <LogoMark />
          <div><div>FAMOUS INTROVERT</div><div className="small">LISTENING ROOMS</div></div>
        </Link>
        <span className="tag">LISTENER PROFILE</span>
      </header>
      <section className="hero">
        <div className="eyebrow">Your listener profile</div>
        <h1>Your name, photo and coins in one place.</h1>
        <p>Edit how you appear in room chat and check your coin balance.</p>
      </section>
      <ListenerProfileClient />
    </main>
  );
}
