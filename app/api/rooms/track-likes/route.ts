import { NextRequest, NextResponse } from "next/server";
import { readRoomSessionToken, ROOM_SESSION_COOKIE } from "../../../../lib/room-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const session = readRoomSessionToken(request.cookies.get(ROOM_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Join the room first." }, { status: 401 });
  const db = createSupabaseAdmin();
  const { data: tracks } = await db.from("room_tracks").select("id").eq("room_id", session.roomId);
  const ids = (tracks ?? []).map((t) => t.id as string);
  if (!ids.length) return NextResponse.json({ counts: {}, mine: [] }, { headers: NO_STORE });
  const { data, error } = await db.from("track_likes").select("track_id, member_id").in("track_id", ids).limit(50_000);
  if (error) return NextResponse.json({ counts: {}, mine: [] }, { headers: NO_STORE });
  const counts: Record<string, number> = {};
  const mine: string[] = [];
  for (const row of data ?? []) {
    counts[row.track_id as string] = (counts[row.track_id as string] ?? 0) + 1;
    if (row.member_id === session.memberId) mine.push(row.track_id as string);
  }
  return NextResponse.json({ counts, mine }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const session = readRoomSessionToken(request.cookies.get(ROOM_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Join the room before liking tracks." }, { status: 401 });
  const b = (await request.json().catch(() => null)) as { track?: unknown; liked?: unknown } | null;
  if (typeof b?.track !== "string" || !UUID.test(b.track) || typeof b.liked !== "boolean") return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const db = createSupabaseAdmin();
  const { data: track } = await db.from("room_tracks").select("id").eq("id", b.track).eq("room_id", session.roomId).maybeSingle();
  if (!track) return NextResponse.json({ error: "Track not found in this room." }, { status: 404 });
  const { error } = b.liked
    ? await db.from("track_likes").upsert({ track_id: b.track, member_id: session.memberId }, { onConflict: "track_id,member_id", ignoreDuplicates: true })
    : await db.from("track_likes").delete().eq("track_id", b.track).eq("member_id", session.memberId);
  if (error) return NextResponse.json({ error: "Could not save your like." }, { status: 503 });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
