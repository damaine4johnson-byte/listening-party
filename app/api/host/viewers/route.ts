import { NextRequest, NextResponse } from "next/server";
import { HOST_SESSION_COOKIE } from "../../../../lib/host-session";
import { readActiveHostSession } from "../../../../lib/host-profile";
import { readRoomSessionToken, ROOM_SESSION_COOKIE } from "../../../../lib/room-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

const ACTIVE_WINDOW_MS = 30_000;

// Live viewer list for the room the host is currently in, ranked by tips.
export async function GET(request: NextRequest) {
  const host = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
  const room = readRoomSessionToken(request.cookies.get(ROOM_SESSION_COOKIE)?.value);
  if (!host || !room) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  try {
    const supabase = createSupabaseAdmin();
    const { data: owned } = await supabase.from("rooms").select("id").eq("id", room.roomId).eq("host_id", host.hostId).maybeSingle();
    if (!owned) return NextResponse.json({ error: "Not your room." }, { status: 403 });

    const [members, orders, visits] = await Promise.all([
      supabase.from("room_memberships").select("member_id, display_name")
        .eq("room_id", room.roomId).gte("last_seen_at", new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString()).limit(500),
      supabase.from("payment_orders").select("kind, member_id, display_name, amount_cents")
        .eq("room_id", room.roomId).eq("status", "paid").limit(5000),
      supabase.from("room_visits").select("member_id, display_name, joined_at")
        .eq("room_id", room.roomId).order("joined_at", { ascending: false }).limit(500),
    ]);
    if (members.error || orders.error || visits.error) return NextResponse.json({ error: "Could not load viewers." }, { status: 503 });

    const joinedAt = new Map((visits.data ?? []).map((visit) => [visit.member_id as string, visit.joined_at as string]));
    const spend = new Map<string, { tip: number; entry: number; tips: number }>();
    for (const order of orders.data ?? []) {
      const key = (order.display_name as string | null)?.trim() || "";
      if (!key) continue;
      const entry = spend.get(key) ?? { tip: 0, entry: 0, tips: 0 };
      if (order.kind === "tip") { entry.tip += order.amount_cents; entry.tips += 1; } else entry.entry += order.amount_cents;
      spend.set(key, entry);
    }

    const viewers = (members.data ?? []).map((member) => {
      const paid = spend.get(member.display_name as string) ?? { tip: 0, entry: 0, tips: 0 };
      return {
        name: member.display_name as string,
        tipCents: paid.tip,
        tipCount: paid.tips,
        spentCents: paid.tip + paid.entry,
        joinedAt: joinedAt.get(member.member_id as string) ?? new Date(0).toISOString(),
        rank: null as number | null,
      };
    }).sort((a, b) => b.tipCents - a.tipCents || a.joinedAt.localeCompare(b.joinedAt));
    let rank = 0;
    for (const viewer of viewers) if (viewer.tipCents > 0) viewer.rank = ++rank;

    return NextResponse.json({
      viewers,
      recentJoins: (visits.data ?? []).slice(0, 5).map((visit) => ({ name: visit.display_name as string, joinedAt: visit.joined_at as string })),
      totalTipCents: (orders.data ?? []).filter((order) => order.kind === "tip").reduce((sum, order) => sum + order.amount_cents, 0),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load viewers." }, { status: 503 });
  }
}
