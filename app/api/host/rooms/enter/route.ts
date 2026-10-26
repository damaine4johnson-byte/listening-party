import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createRoomSessionToken, ROOM_SESSION_COOKIE, ROOM_SESSION_MAX_AGE } from "../../../../../lib/room-session";
import { HOST_SESSION_COOKIE } from "../../../../../lib/host-session";
import { createSupabaseAdmin } from "../../../../../lib/supabase-admin";
import { readActiveHostSession } from "../../../../../lib/host-profile";

// Lets a signed-in host open their own room without an invite code or entry fee.
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const session = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  const input = await request.json().catch(() => null) as { roomId?: unknown } | null;
  const roomId = typeof input?.roomId === "string" ? input.roomId : "";
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return NextResponse.json({ error: "Choose a room." }, { status: 400 });

  try {
    const supabase = createSupabaseAdmin();
    const { data: room, error } = await supabase
      .from("rooms")
      .select("id, status, host_id")
      .eq("id", roomId)
      .eq("host_id", session.hostId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Room service is temporarily unavailable." }, { status: 503 });
    if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    if (room.status === "ended") return NextResponse.json({ error: "This room has ended." }, { status: 409 });

    const memberId = randomUUID();
    const displayName = "Host";
    const { data: joined, error: joinError } = await supabase.rpc("join_room_with_limit", {
      p_room_id: room.id,
      p_member_id: memberId,
      p_display_name: displayName,
    });
    if (joinError) return NextResponse.json({ error: "Room capacity service is not configured." }, { status: 503 });
    if (!joined) return NextResponse.json({ error: "This room has reached its listener limit." }, { status: 409 });

    await supabase
      .from("room_state")
      .upsert({ room_id: room.id, status: "paused", position_seconds: 0 }, { onConflict: "room_id", ignoreDuplicates: true });

    const roomSessionToken = createRoomSessionToken(room.id, memberId, displayName);
    const response = NextResponse.json({
      ok: true,
      ...(request.headers.get("x-fi-mobile") === "1" ? { roomSessionToken } : {}),
    });
    response.cookies.set(ROOM_SESSION_COOKIE, roomSessionToken, {
      httpOnly: true,
      maxAge: ROOM_SESSION_MAX_AGE,
      path: "/",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Room service is not configured." }, { status: 503 });
  }
}
