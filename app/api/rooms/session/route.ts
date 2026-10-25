import { NextRequest, NextResponse } from "next/server";
import { readRoomSessionToken, ROOM_SESSION_COOKIE } from "../../../../lib/room-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { getPlatformSettings } from "../../../../lib/platform-settings";

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

    const reactionSince = new Date(Date.now() - 30_000).toISOString();
    const [roomResult, stateResult, chatResult, reactionResult] = await Promise.all([
      supabase.from("rooms").select("id, title, description, status, host_id").eq("id", session.roomId).maybeSingle(),
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
      supabase
        .from("room_reactions")
        .select("id, display_name, reaction, created_at")
        .eq("room_id", session.roomId)
        .gte("created_at", reactionSince)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (roomResult.error || stateResult.error || chatResult.error || reactionResult.error || !roomResult.data) {
      return NextResponse.json({ error: "Could not load room data." }, { status: 503 });
    }
    if (roomResult.data.status === "ended") {
      return NextResponse.json({ error: "This room has ended." }, { status: 410 });
    }

    let hostProfile = null;
    let hostIsActive = true;
    if (roomResult.data.host_id) {
      const [accountResult, profileResult] = await Promise.all([
        supabase.from("host_accounts").select("account_status").eq("host_id", roomResult.data.host_id).maybeSingle(),
        supabase
          .from("host_profiles")
          .select("display_name, bio, avatar_url, plan_tier, subscription_status")
          .eq("host_id", roomResult.data.host_id)
          .maybeSingle(),
      ]);
      if (accountResult.error || profileResult.error) {
        return NextResponse.json({ error: "Could not load room host settings." }, { status: 503 });
      }
      hostIsActive = accountResult.data?.account_status === "active";
      hostProfile = profileResult.data;
    }
    if (!hostIsActive) return NextResponse.json({ error: "This room is unavailable." }, { status: 410 });
    const platformSettings = await getPlatformSettings();
    const showAds = platformSettings.free_tier_ads_enabled && (
      !hostProfile || hostProfile.plan_tier === "free" || hostProfile.subscription_status !== "active"
    );

    return NextResponse.json(
      {
        room: {
          id: roomResult.data.id,
          title: roomResult.data.title,
          description: roomResult.data.description ?? "",
          status: roomResult.data.status,
        },
        state: stateResult.data,
        messages: (chatResult.data ?? []).reverse(),
        reactions: (reactionResult.data ?? []).reverse(),
        hostProfile: hostProfile
          ? { display_name: hostProfile.display_name, bio: hostProfile.bio, avatar_url: hostProfile.avatar_url }
          : null,
        showAds,
        ad: showAds ? {
          title: platformSettings.free_tier_ad_title,
          body: platformSettings.free_tier_ad_body,
          href: platformSettings.free_tier_ad_href,
        } : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Room service is not configured." }, { status: 503 });
  }
}