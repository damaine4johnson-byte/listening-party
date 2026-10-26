import { NextRequest, NextResponse } from "next/server";
import { HOST_SESSION_COOKIE } from "../../../../lib/host-session";
import { readActiveHostSession } from "../../../../lib/host-profile";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Order = { kind: string; room_id: string; track_id: string | null; member_id: string | null; display_name: string | null; amount_cents: number; paid_at: string | null };

export async function GET(request: NextRequest) {
  const session = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  const roomParam = request.nextUrl.searchParams.get("roomId");
  if (roomParam && !UUID.test(roomParam)) return NextResponse.json({ error: "Choose a room." }, { status: 400 });

  try {
    const supabase = createSupabaseAdmin();
    const { data: ownedRooms, error: roomError } = await supabase
      .from("rooms").select("id, title").eq("host_id", session.hostId).limit(200);
    if (roomError) return NextResponse.json({ error: "Could not load analytics." }, { status: 503 });
    const rooms = ownedRooms ?? [];
    const roomIds = roomParam ? rooms.filter((room) => room.id === roomParam).map((room) => room.id) : rooms.map((room) => room.id);
    if (roomParam && roomIds.length === 0) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    const empty = roomIds.length === 0;

    const since = new Date(Date.now() - 6 * DAY_MS);
    since.setHours(0, 0, 0, 0);
    const [visitsResult, orderResult, membersResult, chatCount, reactionCount] = empty
      ? [null, null, null, null, null]
      : await Promise.all([
        supabase.from("room_visits").select("member_id, display_name, avatar_url, joined_at, room_id")
          .in("room_id", roomIds).order("joined_at", { ascending: false }).limit(2000),
        supabase.from("payment_orders").select("kind, room_id, track_id, member_id, display_name, amount_cents, paid_at")
          .eq("host_id", session.hostId).in("room_id", roomIds).eq("status", "paid").limit(5000),
        supabase.from("room_memberships").select("member_id, last_seen_at").in("room_id", roomIds)
          .gte("last_seen_at", new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString()),
        supabase.from("room_chat").select("id", { count: "exact", head: true }).in("room_id", roomIds),
        supabase.from("room_reactions").select("id", { count: "exact", head: true }).in("room_id", roomIds),
      ]);

    const visits = visitsResult?.data ?? [];
    const orders = (orderResult?.data ?? []) as Order[];
    const activeIds = new Set((membersResult?.data ?? []).map((row) => row.member_id as string));

    const tips = orders.filter((order) => order.kind === "tip");
    const entries = orders.filter((order) => order.kind === "entry");
    const sum = (list: Order[]) => list.reduce((total, order) => total + order.amount_cents, 0);

    const avatarByName = new Map<string, string>();
    const avatarByMember = new Map<string, string>();
    for (const visit of visits) {
      if (!visit.avatar_url) continue;
      if (!avatarByMember.has(visit.member_id)) avatarByMember.set(visit.member_id, visit.avatar_url);
      if (!avatarByName.has(visit.display_name)) avatarByName.set(visit.display_name, visit.avatar_url);
    }

    const tippers = new Map<string, { name: string; totalCents: number; count: number; avatar: string | null }>();
    for (const tip of tips) {
      const name = tip.display_name?.trim() || "Listener";
      const entry = tippers.get(name) ?? {
        name, totalCents: 0, count: 0,
        avatar: (tip.member_id && avatarByMember.get(tip.member_id)) || avatarByName.get(name) || null,
      };
      entry.totalCents += tip.amount_cents;
      entry.count += 1;
      tippers.set(name, entry);
    }

    const songTotals = new Map<string, { totalCents: number; count: number }>();
    for (const tip of tips) {
      if (!tip.track_id) continue;
      const entry = songTotals.get(tip.track_id) ?? { totalCents: 0, count: 0 };
      entry.totalCents += tip.amount_cents;
      entry.count += 1;
      songTotals.set(tip.track_id, entry);
    }
    let topSongs: { title: string; totalCents: number; count: number }[] = [];
    if (songTotals.size > 0) {
      const { data: tracks } = await supabase.from("room_tracks").select("id, title").in("id", [...songTotals.keys()]);
      const titles = new Map((tracks ?? []).map((track) => [track.id as string, track.title as string]));
      topSongs = [...songTotals.entries()]
        .map(([id, value]) => ({ title: titles.get(id) ?? "Removed song", ...value }))
        .sort((a, b) => b.totalCents - a.totalCents).slice(0, 5);
    }

    const days = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(since.getTime() + index * DAY_MS);
      return { date: day.toISOString().slice(0, 10), start: day.getTime(), joins: 0 };
    });
    for (const visit of visits) {
      const time = new Date(visit.joined_at).getTime();
      const bucket = days.find((day) => time >= day.start && time < day.start + DAY_MS);
      if (bucket) bucket.joins += 1;
    }

    const tippedByName = new Map([...tippers.values()].map((tipper) => [tipper.name, tipper.totalCents]));
    return NextResponse.json({
      scope: roomParam ? "room" : "all",
      rooms: rooms.map((room) => ({ id: room.id, title: room.title })),
      totals: {
        listeners: visits.length,
        uniqueNames: new Set(visits.map((visit) => visit.display_name.toLowerCase())).size,
        hereNow: visits.filter((visit) => activeIds.has(visit.member_id)).length,
        tipCents: sum(tips),
        tipCount: tips.length,
        entryCents: sum(entries),
        entryCount: entries.length,
        chatMessages: chatCount?.count ?? 0,
        reactions: reactionCount?.count ?? 0,
      },
      daily: days.map(({ date, joins }) => ({ date, joins })),
      topTippers: [...tippers.values()].sort((a, b) => b.totalCents - a.totalCents).slice(0, 10),
      topSongs,
      listeners: visits.slice(0, 50).map((visit) => ({
        name: visit.display_name,
        avatar: visit.avatar_url,
        joinedAt: visit.joined_at,
        here: activeIds.has(visit.member_id),
        tippedCents: tippedByName.get(visit.display_name) ?? 0,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load analytics." }, { status: 503 });
  }
}
