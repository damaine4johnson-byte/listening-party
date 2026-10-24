import Link from "next/link";
import { cookies } from "next/headers";
import HostDashboard from "./host-dashboard";
import HostLogin from "./host-login";
import { HOST_SESSION_COOKIE, isValidHostSession } from "../../lib/host-session";

export const dynamic = "force-dynamic";

export default async function HostPage() {
  const cookieStore = await cookies();
  const isHost = isValidHostSession(cookieStore.get(HOST_SESSION_COOKIE)?.value);

  return (
    <main className="wrap">
      <header className="nav">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          <div className="mark">FI</div>
          <div><div>FAMOUS INTROVERT</div><div className="small">LISTENING ROOMS</div></div>
        </Link>
        <span className="tag">HOST CONSOLE</span>
      </header>
      <section className="hero">
        <div className="eyebrow">Private room management</div>
        <h1>Host console.</h1>
        <p>Create invitation-only rooms and share each generated code privately.</p>
      </section>
      {isHost ? <HostDashboard /> : <HostLogin />}
      <footer className="footer"><Link href="/">Back to listening rooms</Link></footer>
    </main>
  );
}