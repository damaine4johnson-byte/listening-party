import { NextRequest, NextResponse } from "next/server";
import { readRoomSessionToken, ROOM_SESSION_COOKIE } from "../../../../lib/room-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export async function POST(request: NextRequest) {
  const session = readRoomSessionToken(request.cookies.get(ROOM_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Join the room before sending messages." }, { status: 401 });
  }

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Enter a message." }, { status: 400 });
  }
  if (!input || typeof input !== "object") {
    return NextResponse.json({ error: "Enter a message." }, { status: 400 });
  }

  const bodyValue = (input as { body?: unknown }).body;
  const body = typeof bodyValue === "string" ? bodyValue.trim() : "";
  if (!body || body.length > 500) {
    return NextResponse.json({ error: "Messages must be between 1 and 500 characters." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data: activeMember, error: membershipError } = await supabase
      .from("room_memberships")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("room_id", session.roomId)
      .eq("member_id", session.memberId)
      .select("member_id")
      .maybeSingle();
    if (membershipError) {
      return NextResponse.json({ error: "Room capacity service is not configured." }, { status: 503 });
    }
    if (!activeMember) {
      return NextResponse.json({ error: "Your room session expired. Join the room again." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("room_chat")
      .insert({ room_id: session.roomId, display_name: session.displayName, body })
      .select("id, display_name, body, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: "Chat is temporarily unavailable." }, { status: 503 });
    }
    return NextResponse.json({ message: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Chat service is not configured." }, { status: 503 });
  }
}