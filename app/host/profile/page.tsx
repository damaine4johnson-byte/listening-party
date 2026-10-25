import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import HostProfileForm from "./host-profile-form";
import LogoMark from "../../logo-mark";
import { HOST_SESSION_COOKIE } from "../../../lib/host-session";
import { readActiveHostSession } from "../../../lib/host-profile";

export const dynamic = "force-dynamic";

export default async function HostProfilePage() {
  const cookieStore = await cookies();
  const session = await readActiveHostSession(cookieStore.get(HOST_SESSION_COOKIE)?.value);
  if (!session) redirect("/host");

  return (
    <main className="wrap">
      <header className="nav">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          <LogoMark />
          <div><div>FAMOUS INTROVERT</div><div className="small">LISTENING ROOMS</div></div>
        </Link>
        <Link href="/host" className="tag">HOST CONSOLE</Link>
      </header>
      <section className="hero">
        <div className="eyebrow">Host settings</div>
        <h1>Your profile.</h1>
      </section>
      <HostProfileForm />
      <footer className="footer"><Link href="/host">Back to host console</Link></footer>
    </main>
  );
}