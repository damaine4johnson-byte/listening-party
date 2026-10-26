import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

const PRODUCTS: Record<string, number> = {
  coins_50: 50,
  coins_100: 100,
  coins_200: 200,
};

function isAuthorized(request: NextRequest) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTHORIZATION;
  const actual = request.headers.get("authorization") ?? "";
  if (!expected || expected.length < 24 || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
  const event = payload && typeof payload === "object"
    ? (payload as { event?: Record<string, unknown> }).event
    : null;
  if (!event || typeof event !== "object") {
    return NextResponse.json({ error: "Invalid webhook event." }, { status: 400 });
  }
  const eventId = typeof event.id === "string" ? event.id : "";
  const transactionId = typeof event.transaction_id === "string" ? event.transaction_id : "";
  const userId = typeof event.app_user_id === "string" ? event.app_user_id : "";
  const productId = typeof event.product_id === "string" ? event.product_id : "";
  const coins = PRODUCTS[productId];
  if (
    event.type !== "NON_RENEWING_PURCHASE" ||
    !eventId || eventId.length > 255 ||
    !transactionId || transactionId.length > 255 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) ||
    !coins
  ) {
    return NextResponse.json({ error: "Unsupported or invalid coin purchase event." }, { status: 400 });
  }

  try {
    const { error } = await createSupabaseAdmin().rpc("credit_listener_coins_from_iap", {
      p_event_id: eventId,
      p_transaction_id: transactionId,
      p_user_id: userId,
      p_product_id: productId,
      p_coins: coins,
    });
    if (error) {
      console.error("RevenueCat coin credit failed", { code: error.code ?? "unknown" });
      return NextResponse.json({ error: "Coin delivery failed." }, { status: 503 });
    }
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Coin delivery is not configured." }, { status: 503 });
  }
}
