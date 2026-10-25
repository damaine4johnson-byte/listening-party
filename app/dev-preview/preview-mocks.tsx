"use client";

import { ReactNode, useState } from "react";

const now = Date.now();
const rooms = [
  {
    id: "r1", title: "Midnight Static — First Listen", description: "The full album, front to back, before anyone else hears it.",
    slug: "midnight-static-1a2b3c4d", status: "live", max_listeners: 500, entry_fee_cents: 500, created_at: new Date(now - 3_600_000).toISOString(),
  },
  {
    id: "r2", title: "Acoustic Sessions Vol. 2", description: "",
    slug: "acoustic-sessions-5e6f7a8b", status: "scheduled", max_listeners: 500, entry_fee_cents: 0, created_at: new Date(now - 86_400_000 * 3).toISOString(),
  },
];
const tracks = ["Neon Hallway", "Slow Tide", "Paper Moons"].map((title, index) => ({
  id: `t${index}`, title, duration_seconds: 180 + index * 21, track_order: index,
}));

let previewState: { room_id: string; track_id: string; status: string; position_seconds: number; started_at: string | null; updated_at: string } = {
  room_id: "r1", track_id: "t1", status: "playing", position_seconds: 74, started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function installMocks() {
  if (typeof window === "undefined" || (window as { __previewMocks?: boolean }).__previewMocks) return;
  (window as { __previewMocks?: boolean }).__previewMocks = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.pathname === "/api/host/rooms" && method === "GET") return json({ rooms });
    if (url.pathname === "/api/host/rooms/tracks" && method === "GET") return json({ tracks });
    if (url.pathname === "/api/host/payouts" && method === "GET") {
      return json({
        canChargeEntry: true, paymentsConfigured: true, paypalEmail: "nova@example.com", ready: true,
        pendingCents: 4725, paidCents: 12600,
        platformFeePercent: 10, minEntryFeeCents: 100, maxEntryFeeCents: 100000,
      });
    }
    if (url.pathname === "/api/host/profile" && method === "GET") {
      return json({
        account: { auth_provider: "google", account_identity: "artist@example.com" },
        profile: {
          display_name: "Nova Lane", bio: "Dream-pop from Austin.", avatar_url: "", contact_email: "artist@example.com",
          plan_tier: "tier2", subscription_status: "active",
        },
      });
    }
    if (url.pathname.startsWith("/api/host/") && !(url.pathname === "/api/host/rooms/tracks" && method === "PATCH")) {
      return json({ error: "Preview mode: changes are not saved." }, 400);
    }
    if (url.pathname === "/api/rooms/session") {
      return json({
        room: { title: "Midnight Static — First Listen", description: "The full album, front to back, before anyone else hears it." },
        state: previewState,
        messages: [
          { id: "m1", display_name: "Nova Lane", body: "Welcome in, everyone. Headphones on.", created_at: new Date(now - 240_000).toISOString() },
          { id: "m2", display_name: "Kai", body: "That intro is unreal.", created_at: new Date(now - 150_000).toISOString() },
          { id: "m3", display_name: "Mara", body: "Slow Tide is the one for me.", created_at: new Date(now - 60_000).toISOString() },
        ],
        reactions: [
          { id: "x1", display_name: "Kai", reaction: "fire", created_at: new Date(now - 30_000).toISOString() },
          { id: "x2", display_name: "Mara", reaction: "heart", created_at: new Date(now - 20_000).toISOString() },
        ],
        hostProfile: { display_name: "Nova Lane", bio: "Dream-pop from Austin.", avatar_url: "" },
        showAds: false,
        ad: null,
        isHost: new URLSearchParams(window.location.search).get("host") === "1",
      });
    }
    if (url.pathname === "/api/rooms/playback" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const nowIso = new Date().toISOString();
      previewState = {
        room_id: "r1", track_id: body.trackId, status: body.status, position_seconds: body.positionSeconds,
        started_at: body.status === "playing" ? nowIso : null, updated_at: nowIso,
      };
      return json({ state: previewState });
    }
    if (url.pathname === "/api/host/rooms/tracks" && method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { trackIds: string[] };
      tracks.sort((a, b) => body.trackIds.indexOf(a.id) - body.trackIds.indexOf(b.id));
      tracks.forEach((t, i) => { t.track_order = i; });
      return json({ tracks });
    }
    if (url.pathname === "/api/rooms/tracks") {
      return json({ tracks: tracks.map((t) => ({ id: t.id, title: t.title, durationSeconds: t.duration_seconds, trackOrder: t.track_order, url: "" })) });
    }
    if (url.pathname.startsWith("/api/rooms/")) return json({ error: "Preview mode: changes are not saved." }, 400);
    return realFetch(input, init);
  };
}

export default function PreviewMocks({ children }: { children: ReactNode }) {
  // Patch during first render so child effects already see the mocked API.
  useState(installMocks);
  return (
    <>
      <p className="small" role="note" style={{ textAlign: "center", margin: "12px 0" }}>
        Development preview with sample data. Nothing is saved.
      </p>
      {children}
    </>
  );
}
