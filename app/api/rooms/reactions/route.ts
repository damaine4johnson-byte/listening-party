import { NextRequest, NextResponse } from "next/server";
import { readRoomSessionToken, ROOM_SESSION_COOKIE } from "../../../../lib/room-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

const ALLOWED_REACTIONS = ["heart", "fire", "clap", "laugh", "wow"] as const;

function hasSameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const session = readRoomSessionToken(request.cookies.get(ROOM_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Join the room before reacting." }, { status: 401 });

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Choose a reaction." }, { status: 400 });
  }
  const reaction = input && typeof input === "object"
    ? (input as { reaction?: unknown }).reaction
    : null;
  if (typeof reaction !== "string" || !ALLOWED_REACTIONS.includes(reaction as (typeof ALLOWED_REACTIONS)[number])) {
    return NextResponse.json({ error: "Choose a supported reaction." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data: membership, error: membershipError } = await supabase
      .from("room_memberships")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("room_id", session.roomId)
      .eq("member_id", session.memberId)
      .select("member_id")
      .maybeSingle();
    if (membershipError) return NextResponse.json({ error: "Room capacity service is not configured." }, { status: 503 });
    if (!membership) return NextResponse.json({ error: "Your room session expired. Join again." }, { status: 401 });

    const { data, error } = await supabase
      .from("room_reactions")
      .insert({
        room_id: session.roomId,
        member_id: session.memberId,
        display_name: session.displayName,
        reaction,
      })
      .select("id, display_name, reaction, created_at")
      .single();
    if (error) return NextResponse.json({ error: "Reaction could not be sent." }, { status: 503 });
    return NextResponse.json({ reaction: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Reaction service is not configured." }, { status: 503 });
  }
}