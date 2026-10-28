import { NextRequest, NextResponse } from "next/server";
import { getListenerUser } from "../../../../lib/listener-auth";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { createWipayCheckout, isWipayConfigured } from "../../../../lib/wipay";

const PACKS = { "50": { cents: 500, coins: 50 }, "100": { cents: 1000, coins: 100 }, "200": { cents: 2000, coins: 200 },
  "500": { cents: 5000, coins: 500 }, "1000": { cents: 10000, coins: 1000 }, "2500": { cents: 25000, coins: 2500 },
  "5000": { cents: 50000, coins: 5000 }, "10000": { cents: 100000, coins: 10000 } } as const;

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const user = await getListenerUser(request);
  if (!user) return NextResponse.json({ error: "Sign in with Google to buy coins." }, { status: 401 });
  if (!isWipayConfigured()) return NextResponse.json({ error: "Coin purchases are not available right now." }, { status: 503 });

  let input: { pack?: unknown };
  try {
    input = await request.json() as typeof input;
  } catch {
    return NextResponse.json({ error: "Choose a coin pack." }, { status: 400 });
  }
  if (typeof input.pack !== "string" || !Object.hasOwn(PACKS, input.pack)) {
    return NextResponse.json({ error: "Choose a valid coin pack." }, { status: 400 });
  }
  const pack = PACKS[input.pack as keyof typeof PACKS];

  try {
    const supabase = createSupabaseAdmin();
    const { data: order, error } = await supabase
      .from("payment_orders")
      .insert({
        kind: "coin_purchase",
        listener_user_id: user.id,
        amount_cents: pack.cents,
        coins_purchased: pack.coins,
      })
      .select("order_id")
      .single();
    if (error || !order) {
      console.error("Coin purchase order creation failed", { code: error?.code ?? "unknown" });
      return NextResponse.json({ error: "Could not start coin checkout." }, { status: 503 });
    }

    const checkout = await createWipayCheckout({
      orderId: order.order_id,
      amountCents: pack.cents,
      origin: request.nextUrl.origin,
    });
    return NextResponse.json({ url: checkout.url });
  } catch {
    return NextResponse.json({ error: "Could not start coin checkout. Try again shortly." }, { status: 502 });
  }
}
