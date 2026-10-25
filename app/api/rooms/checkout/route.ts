import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { createWipayCheckout, isWipayConfigured } from "../../../../lib/wipay";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  if (!isWipayConfigured()) {
    return NextResponse.json({ error: "Payments are not available right now." }, { status: 503 });
  }

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Enter an invitation code." }, { status: 400 });
  }
  const code = input && typeof input === "object" && typeof (input as { code?: unknown }).code === "string"
    ? (input as { code: string }).code.trim()
    : "";
  if (!code || code.length > 128) {
    return NextResponse.json({ error: "Enter an invitation code." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data: room, error } = await supabase
      .from("rooms")
      .select("id, status, host_id, max_listeners, entry_fee_cents")
      .eq("invite_code_hash", createHash("sha256").update(code).digest("hex"))
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Room service is temporarily unavailable." }, { status: 503 });
    if (!room || room.status === "ended") {
      return NextResponse.json({ error: "That invitation code is invalid or the room has ended." }, { status: 401 });
    }
    if (!room.entry_fee_cents || room.entry_fee_cents <= 0) {
      return NextResponse.json({ error: "This room does not require payment." }, { status: 400 });
    }

    const activeSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("room_memberships")
      .select("member_id", { count: "exact", head: true })
      .eq("room_id", room.id)
      .gte("last_seen_at", activeSince);
    if ((count ?? 0) >= room.max_listeners) {
      return NextResponse.json({ error: "This room has reached its listener limit." }, { status: 409 });
    }

    const { data: order, error: orderError } = await supabase
      .from("payment_orders")
      .insert({ kind: "entry", room_id: room.id, host_id: room.host_id, amount_cents: room.entry_fee_cents })
      .select("order_id")
      .single();
    if (orderError || !order) return NextResponse.json({ error: "Could not start checkout. Try again shortly." }, { status: 503 });

    const checkout = await createWipayCheckout({
      orderId: order.order_id,
      amountCents: room.entry_fee_cents,
      origin: request.nextUrl.origin,
    });
    return NextResponse.json({ url: checkout.url });
  } catch {
    return NextResponse.json({ error: "Could not start checkout. Try again shortly." }, { status: 502 });
  }
}
