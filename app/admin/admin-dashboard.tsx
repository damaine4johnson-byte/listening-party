"use client";

import { useEffect, useState } from "react";
import AdminArtists from "./admin-artists";
import AdminPlatformSettings from "./admin-platform-settings";

type Overview = {
  identity: string;
  artists: number;
  rooms: number;
  liveRooms: number;
  plans: { free: number; tier2: number; tier3: number };
};

export default function AdminDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [notice, setNotice] = useState("Loading platform overview...");
  const [view, setView] = useState<"overview" | "artists" | "settings">("overview");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/overview", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load overview.");
        if (!active) return;
        setOverview(result);
        setNotice("");
      })
      .catch((error: unknown) => {
        if (active) setNotice(error instanceof Error ? error.message : "Could not load overview.");
      });
    return () => { active = false; };
  }, []);

  async function signOut() {
    await fetch("/api/admin/session", { method: "DELETE" });
    window.location.reload();
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
        <span className="small">Developer account: {overview?.identity ?? ""}</span>
        <button className="btn secondary" type="button" onClick={() => void signOut()}>Sign out</button>
      </div>
      <div className="row" role="tablist" aria-label="Developer admin sections" style={{ marginBottom: 20 }}>
        <button className={view === "overview" ? "btn" : "btn secondary"} type="button" role="tab" aria-selected={view === "overview"} onClick={() => setView("overview")}>Overview</button>
        <button className={view === "artists" ? "btn" : "btn secondary"} type="button" role="tab" aria-selected={view === "artists"} onClick={() => setView("artists")}>Artists &amp; plans</button>
        <button className={view === "settings" ? "btn" : "btn secondary"} type="button" role="tab" aria-selected={view === "settings"} onClick={() => setView("settings")}>Settings</button>
      </div>
      {view === "overview" && (notice ? <p className="small" role="status">{notice}</p> : overview && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <section className="panel"><div className="eyebrow">Artists</div><h2>{overview.artists}</h2></section>
          <section className="panel"><div className="eyebrow">Rooms</div><h2>{overview.rooms}</h2></section>
          <section className="panel"><div className="eyebrow">Live rooms</div><h2>{overview.liveRooms}</h2></section>
          <section className="panel"><div className="eyebrow">Free plans</div><h2>{overview.plans.free}</h2></section>
          <section className="panel"><div className="eyebrow">Tier 2</div><h2>{overview.plans.tier2}</h2></section>
          <section className="panel"><div className="eyebrow">Tier 3</div><h2>{overview.plans.tier3}</h2></section>
        </div>
      ))}
      {view === "artists" && <AdminArtists />}
      {view === "settings" && <AdminPlatformSettings />}
    </>
  );
}