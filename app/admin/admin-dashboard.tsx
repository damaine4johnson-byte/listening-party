"use client";

import { useEffect, useState } from "react";

type Overview = {
  email: string;
  artists: number;
  rooms: number;
  liveRooms: number;
  plans: { free: number; tier2: number; tier3: number };
};

export default function AdminDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [notice, setNotice] = useState("Loading platform overview...");

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
        <span className="small">Developer account: {overview?.email ?? ""}</span>
        <button className="btn secondary" type="button" onClick={() => void signOut()}>Sign out</button>
      </div>
      {notice ? <p className="small" role="status">{notice}</p> : overview && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <section className="panel"><div className="eyebrow">Artists</div><h2>{overview.artists}</h2></section>
          <section className="panel"><div className="eyebrow">Rooms</div><h2>{overview.rooms}</h2></section>
          <section className="panel"><div className="eyebrow">Live rooms</div><h2>{overview.liveRooms}</h2></section>
          <section className="panel"><div className="eyebrow">Free plans</div><h2>{overview.plans.free}</h2></section>
          <section className="panel"><div className="eyebrow">Tier 2</div><h2>{overview.plans.tier2}</h2></section>
          <section className="panel"><div className="eyebrow">Tier 3</div><h2>{overview.plans.tier3}</h2></section>
        </div>
      )}
    </>
  );
}