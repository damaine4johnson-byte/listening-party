import Link from "next/link";
import { notFound } from "next/navigation";
import HostDashboard from "../../host/host-dashboard";
import HostHero from "../../host/host-hero";
import LogoMark from "../../logo-mark";
import PreviewMocks from "../preview-mocks";

export default function HostPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="wrap">
      <header className="nav">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          <LogoMark />
          <div><div>FAMOUS INTROVERT</div><div className="small">LISTENING ROOMS</div></div>
        </Link>
        <span className="tag">HOST CONSOLE</span>
      </header>
      <HostHero />
      <PreviewMocks><HostDashboard /></PreviewMocks>
    </main>
  );
}
