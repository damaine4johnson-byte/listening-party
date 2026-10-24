import Link from "next/link";
import JoinForm from "./join-form";
export default function Home() {
  return <main className="wrap">
    <header className="nav"><div className="brand"><div className="mark">FI</div><div><div>FAMOUS INTROVERT</div><div className="small">LISTENING ROOMS</div></div></div><span className="tag">PRIVATE FIRST LISTENS</span></header>
    <section className="hero"><div className="eyebrow">A new way to hear what's next</div><h1>Before the world hears it.</h1><p>Exclusive listening experiences from Famous Introvert Records. Join a room, hear new music in sync, and be part of the first reaction.</p><span className="tag">Invitation required · Plans up to 10,000 listeners</span></section>
    <section className="grid">
      <div className="panel"><h2>Enter a listening room</h2><p className="muted">Use the invitation code shared by the host. You can join as a guest with a display name.</p><JoinForm/></div>
      <aside className="panel"><div className="eyebrow">Made for the fans</div><h2>Hear it together.</h2><p className="muted">Host-controlled playback, real-time chat, and a private room built for music previews.</p><div className="divider"/><p className="small">This is an MVP preview. Room access, secure invitations, and track delivery must be configured before using real unreleased masters.</p></aside>
    </section><footer className="footer"><Link className="btn secondary" href="/signup">Sign up as an artist</Link> · <Link href="/host">Host access</Link> · © Famous Introvert Records</footer>
  </main>
}
