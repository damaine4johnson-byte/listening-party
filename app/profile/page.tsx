import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LogoMark from "../logo-mark";
import ListenerProfileClient from "./listener-profile-client";
import { HOST_SESSION_COOKIE } from "../../lib/host-session";
import { handleOf } from "../../lib/artists-public";
import { readActiveHostSession } from "../../lib/host-profile";

export const metadata = { title: "Your profile · Famous Introvert" };
export const dynamic = "force-dynamic";

export default async function ListenerProfilePage() {
  const cookieStore = await cookies();
  const hostSession = await readActiveHostSession(cookieStore.get(HOST_SESSION_COOKIE)?.value);
  if (hostSession) redirect(`/artists/${handleOf(hostSession.hostId)}`);

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
