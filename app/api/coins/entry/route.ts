import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getListenerUser } from "../../../../lib/listener-auth";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { HOST_SESSION_COOKIE } from "../../../../lib/host-session";
import { readActiveHostSession } from "../../../../lib/host-profile";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const user = await getListenerUser(request);
  if (!user) return NextResponse.json({ error: "Sign in with Google to spend coins." }, { status: 401 });

  let input: { code?: unknown; displayName?: unknown };
  try {
    input = await request.json() as typeof input;
  } catch {
    return NextResponse.json({ error: "Enter an invitation code." }, { status: 400 });
  }
  const code = typeof input.code === "string" ? input.code.trim() : "";
  const displayName = typeof input.displayName === "string" ? input.displayName.trim().slice(0, 32) : "";
  if (!code || code.length > 128 || !displayName) {
    return NextResponse.json({ error: "Enter an invitation code and display name." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data: room, error } = await supabase
      .from("rooms")
      .select("id, status, host_id, max_listeners, entry_fee_cents")
      .eq("invite_code_hash", createHash("sha256").update(code).digest("hex"))
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Room service is temporarily unavailable." }, { status: 503 });
    if (!room || room.status === "ended") return NextResponse.json({ error: "That invitation code is invalid or the room has ended." }, { status: 401 });
    if (!room.entry_fee_cents || room.entry_fee_cents <= 0) return NextResponse.json({ error: "This room does not require payment." }, { status: 400 });
    if (room.entry_fee_cents % 10 !== 0) {
      return NextResponse.json({ error: "This room's entry fee cannot be paid with whole coins. Use the card checkout instead." }, { status: 400 });
    }

    const hostSession = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
    if (hostSession && room.host_id && hostSession.hostId === room.host_id) {
      return NextResponse.json({ error: "The host does not need to pay an entry fee." }, { status: 400 });
    }
    const activeSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from("room_memberships")
      .select("member_id", { count: "exact", head: true })
      .eq("room_id", room.id)
      .gte("last_seen_at", activeSince);
    if (countError) return NextResponse.json({ error: "Room capacity service is unavailable." }, { status: 503 });
    if ((count ?? 0) >= room.max_listeners) return NextResponse.json({ error: "This room has reached its listener limit." }, { status: 409 });

    const coins = room.entry_fee_cents / 10;
    const { data: orderId, error: spendError } = await supabase.rpc("spend_listener_coins", {
      p_user_id: user.id,
      p_kind: "entry",
      p_room_id: room.id,
      p_host_id: room.host_id,
      p_track_id: null,
      p_member_id: null,
      p_display_name: displayName,
      p_coins: coins,
    });
    if (spendError || !orderId) {
      if (spendError?.message.includes("Insufficient coin balance")) {
        return NextResponse.json({ error: "Not enough coins. Buy more coins or use card checkout." }, { status: 402 });
      }
      console.error("Coin entry payment failed", { code: spendError?.code ?? "unknown" });
      return NextResponse.json({ error: "Could not spend coins for room entry." }, { status: 503 });
    }
    return NextResponse.json({ paymentSessionId: orderId });
  } catch {
    return NextResponse.json({ error: "Coin wallet is not configured." }, { status: 503 });
  }
}
