import { NextRequest, NextResponse } from "next/server";
import { readRoomSessionToken, ROOM_SESSION_COOKIE } from "../../../../lib/room-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export async function GET(request: NextRequest) {
  const session = readRoomSessionToken(request.cookies.get(ROOM_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Your room session has expired. Join again." }, { status: 401 });
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

    const [roomResult, stateResult, chatResult] = await Promise.all([
      supabase.from("rooms").select("id, title, status, host_id").eq("id", session.roomId).maybeSingle(),
      supabase
        .from("room_state")
        .select("room_id, track_id, status, position_seconds, started_at, updated_at")
        .eq("room_id", session.roomId)
        .maybeSingle(),
      supabase
        .from("room_chat")
        .select("id, display_name, body, created_at")
        .eq("room_id", session.roomId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (roomResult.error || stateResult.error || chatResult.error || !roomResult.data) {
      return NextResponse.json({ error: "Could not load room data." }, { status: 503 });
    }
    if (roomResult.data.status === "ended") {
      return NextResponse.json({ error: "This room has ended." }, { status: 410 });
    }

    let hostProfile = null;
    if (roomResult.data.host_id) {
      const { data, error } = await supabase
        .from("host_profiles")
        .select("display_name, bio, avatar_url, plan_tier, subscription_status")
        .eq("host_id", roomResult.data.host_id)
        .maybeSingle();
      if (error) return NextResponse.json({ error: "Could not load room host profile." }, { status: 503 });
      hostProfile = data;
    }

    return NextResponse.json(
      {
        room: { id: roomResult.data.id, title: roomResult.data.title, status: roomResult.data.status },
        state: stateResult.data,
        messages: (chatResult.data ?? []).reverse(),
        hostProfile: hostProfile
          ? { display_name: hostProfile.display_name, bio: hostProfile.bio, avatar_url: hostProfile.avatar_url }
          : null,
        showAds: !hostProfile || hostProfile.plan_tier === "free" || hostProfile.subscription_status !== "active",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Room service is not configured." }, { status: 503 });
  }
}