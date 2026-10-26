import Link from "next/link";
import LogoMark from "../logo-mark";
import WalletClient from "./wallet-client";

export default function WalletPage() {
  return (
    <main className="wrap">
      <header className="nav">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          <LogoMark />
          <div><div>FAMOUS INTROVERT</div><div className="small">LISTENING ROOMS</div></div>
        </Link>
        <span className="tag">LISTENER COINS</span>
      </header>
      <section className="hero">
        <div className="eyebrow">Listener wallet</div>
        <h1>More music, one coin at a time.</h1>
        <p>Buy coins for room entry and song boosts. 1 USD = 10 coins.</p>
      </section>
      <WalletClient />
      <footer className="footer"><Link href="/">Back to listening rooms</Link></footer>
    </main>
  );
}
