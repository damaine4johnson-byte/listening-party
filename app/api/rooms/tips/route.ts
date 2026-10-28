import { NextRequest, NextResponse } from "next/server";
import { readRoomSessionToken, ROOM_SESSION_COOKIE } from "../../../../lib/room-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { createWipayCheckout, isWipayConfigured, MAX_TIP_CENTS, MIN_TIP_CENTS } from "../../../../lib/wipay";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Starts a WiPay checkout; the song is boosted when the verified payment returns.
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const session = readRoomSessionToken(request.cookies.get(ROOM_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Join the room before tipping." }, { status: 401 });
  if (!isWipayConfigured()) {
    return NextResponse.json({ error: "Tips are not available right now." }, { status: 503 });
  }

  let input: { trackId?: unknown; amountCents?: unknown };
  try {
    input = await request.json() as typeof input;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const amountCents = Number(input.amountCents);
  if (typeof input.trackId !== "string" || !UUID.test(input.trackId)) {
    return NextResponse.json({ error: "Choose a song." }, { status: 400 });
  }
  if (!Number.isInteger(amountCents) || amountCents < MIN_TIP_CENTS || amountCents > MAX_TIP_CENTS) {
    return NextResponse.json({ error: "Tips must be between $1 and $10,000." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data: room } = await supabase.from("rooms").select("id, status, host_id").eq("id", session.roomId).maybeSingle();
    if (!room || room.status === "ended") return NextResponse.json({ error: "This room has ended." }, { status: 409 });
    if (!room.host_id) return NextResponse.json({ error: "This host is not accepting tips yet." }, { status: 503 });

    const { data: profile } = await supabase
      .from("host_profiles")
      .select("paypal_email")
      .eq("host_id", room.host_id)
      .maybeSingle();
    if (!profile?.paypal_email) return NextResponse.json({ error: "This host is not accepting tips yet." }, { status: 503 });

    const { data: track } = await supabase
      .from("room_tracks")
      .select("id")
      .eq("id", input.trackId)
      .eq("room_id", session.roomId)
      .maybeSingle();
    if (!track) return NextResponse.json({ error: "Song not found in this room." }, { status: 404 });
    const { data: state } = await supabase.from("room_state").select("track_id").eq("room_id", session.roomId).maybeSingle();
    if (state?.track_id === track.id) return NextResponse.json({ error: "That song is already playing." }, { status: 409 });

    const { data: order, error } = await supabase
      .from("payment_orders")
      .insert({
        kind: "tip",
        room_id: room.id,
        host_id: room.host_id,
        track_id: track.id,
        member_id: session.memberId,
        display_name: session.displayName,
        amount_cents: amountCents,
      })
      .select("order_id")
      .single();
    if (error || !order) return NextResponse.json({ error: "Could not start the tip." }, { status: 503 });

    const checkout = await createWipayCheckout({
      orderId: order.order_id,
      amountCents,
      origin: request.nextUrl.origin,
    });
    return NextResponse.json({ url: checkout.url });
  } catch {
    return NextResponse.json({ error: "Tip service is temporarily unavailable." }, { status: 502 });
  }
}
