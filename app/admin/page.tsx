import { cookies } from "next/headers";
import AdminDashboard from "./admin-dashboard";
import AdminLogin from "./admin-login";
import LogoMark from "../logo-mark";
import { ADMIN_SESSION_COOKIE, readAdminSession } from "../../lib/admin-session";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const session = readAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);

  return (
    <main className="wrap">
      <header className="nav">
        <div className="brand"><LogoMark /><div><div>FAMOUS INTROVERT</div><div className="small">DEVELOPER ADMIN</div></div></div>
        <span className="tag">RESTRICTED</span>
      </header>
      <section className="hero">
        <div className="eyebrow">Internal tools</div>
        <h1>Platform overview.</h1>
      </section>
      {session ? <AdminDashboard /> : <AdminLogin />}
    </main>
  );
}