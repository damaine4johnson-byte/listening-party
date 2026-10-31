import { NextRequest, NextResponse } from "next/server";
import { authorize } from "../../../../lib/admin-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
  const db = createSupabaseAdmin();
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const count = (
    table: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filter?: (q: any) => any,
  ) => {
    const q = db.from(table).select("*", { count: "exact", head: true });
    return (filter ? filter(q) : q) as PromiseLike<{ count: number | null }>;
  };

  try {
    const [artists, suspended, rooms, liveRooms, listeners, visits, orders, visitRows, orderRows, unpaid] = await Promise.all([
      count("host_accounts"),
      count("host_accounts", (q) => q.eq("account_status", "suspended")),
      count("rooms"),
      count("rooms", (q) => q.eq("status", "live")),
      count("room_memberships"),
      count("room_visits"),
      count("payment_orders", (q) => q.eq("status", "paid")),
      db.from("room_visits").select("joined_at").gte("joined_at", since).limit(20_000),
      db.from("payment_orders").select("amount_cents, kind, paid_at").eq("status", "paid").gte("paid_at", since).limit(20_000),
      db.from("host_earnings").select("net_cents").is("paid_out_at", null).limit(20_000),
    ]);

    const days: Record<string, { date: string; visits: number; revenueCents: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const date = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
      days[date] = { date, visits: 0, revenueCents: 0 };
    }
    for (const row of visitRows.data ?? []) {
      const d = days[String(row.joined_at).slice(0, 10)];
      if (d) d.visits += 1;
    }
    const revenueByKind: Record<string, number> = {};
    for (const row of orderRows.data ?? []) {
      const d = days[String(row.paid_at).slice(0, 10)];
      if (d) d.revenueCents += row.amount_cents;
      revenueByKind[row.kind] = (revenueByKind[row.kind] ?? 0) + row.amount_cents;
    }

    return NextResponse.json({
      totals: {
        artists: artists.count ?? 0,
        suspendedArtists: suspended.count ?? 0,
        rooms: rooms.count ?? 0,
        liveRooms: liveRooms.count ?? 0,
        listeners: listeners.count ?? 0,
        roomVisits: visits.count ?? 0,
        paidOrders: orders.count ?? 0,
        unpaidArtistEarningsCents: (unpaid.data ?? []).reduce((s, r) => s + r.net_cents, 0),
      },
      revenueLast30DaysCents: Object.values(revenueByKind).reduce((a, b) => a + b, 0),
      revenueByKind,
      daily: Object.values(days),
    });
  } catch {
    return NextResponse.json({ error: "Could not load analytics." }, { status: 503 });
  }
}
