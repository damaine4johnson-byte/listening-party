import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createRoomSessionToken, ROOM_SESSION_COOKIE, ROOM_SESSION_MAX_AGE } from "../../../../lib/room-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export async function POST(request: NextRequest) {
  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Enter an invitation code and display name." }, { status: 400 });
  }
  if (!input || typeof input !== "object") {
    return NextResponse.json({ error: "Enter an invitation code and display name." }, { status: 400 });
  }

  const values = input as { code?: unknown; displayName?: unknown };
  const code = typeof values.code === "string" ? values.code.trim() : "";
  const displayName = typeof values.displayName === "string" ? values.displayName.trim().slice(0, 32) : "";
  if (!code || code.length > 128 || !displayName) {
    return NextResponse.json({ error: "Enter an invitation code and display name." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const inviteCodeHash = createHash("sha256").update(code).digest("hex");
    const { data: room, error } = await supabase
      .from("rooms")
      .select("id, title, status")
      .eq("invite_code_hash", inviteCodeHash)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Room service is temporarily unavailable." }, { status: 503 });
    }
    if (!room || room.status === "ended") {
      return NextResponse.json({ error: "That invitation code is invalid or the room has ended." }, { status: 401 });
    }

    const memberId = randomUUID();
    const { data: joined, error: membershipError } = await supabase.rpc("join_room_with_limit", {
      p_room_id: room.id,
      p_member_id: memberId,
      p_display_name: displayName,
    });
    if (membershipError) {
      return NextResponse.json({ error: "Room capacity service is not configured." }, { status: 503 });
    }
    if (!joined) {
      return NextResponse.json({ error: "This room has reached its listener limit." }, { status: 409 });
    }

    const { error: stateError } = await supabase
      .from("room_state")
      .upsert(
        { room_id: room.id, status: "paused", position_seconds: 0 },
        { onConflict: "room_id", ignoreDuplicates: true },
      );
    if (stateError) {
      await supabase.from("room_memberships").delete().eq("room_id", room.id).eq("member_id", memberId);
      return NextResponse.json({ error: "Room state could not be initialized." }, { status: 503 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ROOM_SESSION_COOKIE, createRoomSessionToken(room.id, memberId, displayName), {
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