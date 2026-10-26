import { NextRequest, NextResponse } from "next/server";
import { getListenerUser } from "../../../../lib/listener-auth";
import { readRoomSessionToken, ROOM_SESSION_COOKIE } from "../../../../lib/room-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { boostTrack } from "../../../../lib/room-queue";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIP_COINS = new Set([30, 50, 100]);

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const user = await getListenerUser(request);
  if (!user) return NextResponse.json({ error: "Sign in with Google to tip with coins." }, { status: 401 });
  const session = readRoomSessionToken(request.cookies.get(ROOM_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Join the room before tipping." }, { status: 401 });

  let input: { trackId?: unknown; coins?: unknown };
  try {
    input = await request.json() as typeof input;
  } catch {
    return NextResponse.json({ error: "Choose a song and coin amount." }, { status: 400 });
  }
  if (typeof input.trackId !== "string" || !UUID.test(input.trackId) ||
      typeof input.coins !== "number" || !TIP_COINS.has(input.coins)) {
    return NextResponse.json({ error: "Choose a valid song and coin amount." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const [roomResult, trackResult, stateResult] = await Promise.all([
      supabase.from("rooms").select("id, status, host_id").eq("id", session.roomId).maybeSingle(),
      supabase.from("room_tracks").select("id").eq("id", input.trackId).eq("room_id", session.roomId).maybeSingle(),
      supabase.from("room_state").select("track_id").eq("room_id", session.roomId).maybeSingle(),
    ]);
    if (roomResult.error || trackResult.error || stateResult.error) {
      return NextResponse.json({ error: "Room service is temporarily unavailable." }, { status: 503 });
    }
    const room = roomResult.data;
    const track = trackResult.data;
    const state = stateResult.data;
    if (!room || room.status === "ended") return NextResponse.json({ error: "This room has ended." }, { status: 409 });
    if (!room.host_id) return NextResponse.json({ error: "This host is not accepting tips yet." }, { status: 503 });
    const { data: hostProfile, error: profileError } = await supabase
      .from("host_profiles")
      .select("paypal_email")
      .eq("host_id", room.host_id)
      .maybeSingle();
    if (profileError) return NextResponse.json({ error: "Could not verify the host's payout settings." }, { status: 503 });
    if (!hostProfile?.paypal_email) return NextResponse.json({ error: "This host is not accepting tips yet." }, { status: 503 });
    if (!track) return NextResponse.json({ error: "Song not found in this room." }, { status: 404 });
    if (state?.track_id === track.id) return NextResponse.json({ error: "That song is already playing." }, { status: 409 });

    const { data: orderId, error } = await supabase.rpc("spend_listener_coins", {
      p_user_id: user.id,
      p_kind: "tip",
      p_room_id: room.id,
      p_host_id: room.host_id,
      p_track_id: track.id,
      p_member_id: session.memberId,
      p_display_name: session.displayName,
      p_coins: input.coins,
    });
    if (error || !orderId) {
      if (error?.message.includes("Insufficient coin balance")) {
        return NextResponse.json({ error: "Not enough coins. Buy more coins from your wallet." }, { status: 402 });
      }
      console.error("Coin tip payment failed", { code: error?.code ?? "unknown" });
      return NextResponse.json({ error: "Could not spend coins for this tip." }, { status: 503 });
    }
    await boostTrack(room.id, track.id);
    return NextResponse.json({ orderId, balanceUpdated: true });
  } catch {
    return NextResponse.json({ error: "Coin wallet is not configured." }, { status: 503 });
  }
}
