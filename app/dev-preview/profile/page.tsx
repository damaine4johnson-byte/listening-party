import Link from "next/link";
import { notFound } from "next/navigation";
import HostProfileForm from "../../host/profile/host-profile-form";
import LogoMark from "../../logo-mark";
import PreviewMocks from "../preview-mocks";

export default function ProfilePreviewPage() {
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
      <section className="hero">
        <div className="eyebrow">Host settings</div>
        <h1>Your profile.</h1>
      </section>
      <PreviewMocks><HostProfileForm /></PreviewMocks>
    </main>
  );
}
