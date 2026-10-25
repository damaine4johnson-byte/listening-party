import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "../../../../../lib/supabase-admin";
import { boostTrack } from "../../../../../lib/room-queue";
import { platformFeeCents, verifyWipayHash } from "../../../../../lib/wipay";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function redirect(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);
}

// WiPay sends the listener's browser here after checkout. Nothing is trusted until the hash checks out.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const orderId = params.get("order_id") ?? "";
  const transactionId = params.get("transaction_id") ?? "";
  const hash = params.get("hash") ?? "";
  if (!UUID.test(orderId)) return redirect(request, "/?payment=invalid");

  try {
    const supabase = createSupabaseAdmin();
    const { data: order } = await supabase
      .from("payment_orders")
      .select("order_id, kind, room_id, host_id, track_id, amount_cents, status")
      .eq("order_id", orderId)
      .maybeSingle();
    if (!order) return redirect(request, "/?payment=invalid");

    const failedPath = order.kind === "tip" ? "/room?tip=failed" : "/?payment=failed#enter-room";
    if (params.get("status") !== "success") return redirect(request, failedPath);
    if (!transactionId || !hash || !verifyWipayHash(transactionId, order.amount_cents, hash)) {
      return redirect(request, "/?payment=invalid");
    }

    const okPath = order.kind === "tip" ? "/room?tip=ok" : `/?paid=${order.order_id}#enter-room`;
    if (order.status === "paid") return redirect(request, okPath);

    // Only the request that flips pending -> paid applies the side effects.
    const { data: settled } = await supabase
      .from("payment_orders")
      .update({ status: "paid", paid_at: new Date().toISOString(), wipay_transaction_id: transactionId })
      .eq("order_id", order.order_id)
      .eq("status", "pending")
      .select("order_id");
    if (settled?.length) {
      if (order.host_id) {
        const fee = platformFeeCents(order.amount_cents);
        const { error } = await supabase.from("host_earnings").insert({
          host_id: order.host_id,
          order_id: order.order_id,
          gross_cents: order.amount_cents,
          fee_cents: fee,
          net_cents: order.amount_cents - fee,
        });
        if (error) console.error("Earnings ledger insert failed", { code: error.code ?? "unknown" });
      }
      if (order.kind === "tip" && order.track_id) await boostTrack(order.room_id, order.track_id);
    }
    return redirect(request, okPath);
  } catch {
    console.error("WiPay return handling failed");
    return redirect(request, "/?payment=error");
  }
}
