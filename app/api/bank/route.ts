import { NextRequest, NextResponse } from "next/server";
import { getListenerUser } from "../../../lib/listener-auth";
import { createSupabaseAdmin } from "../../../lib/supabase-admin";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

// GET: account balance summary — coin balance, lifetime earnings, withdrawal history.
export async function GET(request: NextRequest) {
  const user = await getListenerUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to view your bank." }, { status: 401 });

  try {
    const db = createSupabaseAdmin();
    const [wallet, tips, withdrawals] = await Promise.all([
      db.from("listener_coin_wallets").select("balance_coins").eq("user_id", user.id).maybeSingle(),
      db.from("payment_orders").select("amount_cents").eq("kind", "tip").eq("status", "paid").eq("listener_user_id", user.id).limit(10000),
      db.from("bank_withdrawals").select("id, coins, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(25),
    ]);
    if (withdrawals.error) {
      // Table not migrated yet — degrade to balance-only.
      return NextResponse.json({
        balanceCoins: wallet.data?.balance_coins ?? 0,
        earnedCents: (tips.data ?? []).reduce((s, r) => s + (r.amount_cents as number), 0),
        withdrawals: [],
        needsMigration: true,
      }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({
      balanceCoins: wallet.data?.balance_coins ?? 0,
      earnedCents: (tips.data ?? []).reduce((s, r) => s + (r.amount_cents as number), 0),
      withdrawals: withdrawals.data ?? [],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Bank is not configured." }, { status: 503 });
  }
}

// POST: request a withdrawal of earned coins. Min 500 coins (=$50) so payouts are worthwhile.
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const user = await getListenerUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to request a withdrawal." }, { status: 401 });

  const MIN_COINS = 500;
  try {
    const db = createSupabaseAdmin();
    const { data: wallet } = await db.from("listener_coin_wallets").select("balance_coins").eq("user_id", user.id).maybeSingle();
    const balance = wallet?.balance_coins ?? 0;
    if (balance < MIN_COINS) {
      return NextResponse.json({ error: `You need at least ${MIN_COINS.toLocaleString()} coins to withdraw.` }, { status: 400 });
    }

    // Earnings only (tips), so purchases can't be cashed out.
    const { data: tips } = await db.from("payment_orders")
      .select("amount_cents").eq("kind", "tip").eq("status", "paid").eq("listener_user_id", user.id).limit(10000);
    const earnedCoins = Math.floor(((tips ?? []).reduce((s, r) => s + (r.amount_cents as number), 0)) / 10);
    const alreadyPending = await db.from("bank_withdrawals")
      .select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "pending");
    if ((alreadyPending.count ?? 0) > 0) {
      return NextResponse.json({ error: "You already have a withdrawal awaiting review." }, { status: 429 });
    }

    const coins = Math.min(balance, earnedCoins);
    if (coins < MIN_COINS) {
      return NextResponse.json({ error: "Withdrawals cover earnings only (tips and payouts). Keep buying coins with a card." }, { status: 400 });
    }

    const { data, error } = await db.from("bank_withdrawals")
      .insert({ user_id: user.id, coins, status: "pending" })
      .select("id").single();
    if (error || !data) return NextResponse.json({ error: "Could not record the withdrawal. Run supabase/bank_withdrawals.sql." }, { status: 503 });
    return NextResponse.json({ ok: true, coins }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Bank is not configured." }, { status: 503 });
  }
}

// Admin approval lives in the admin API; members can only cancel their own pending request.
export async function DELETE(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const user = await getListenerUser(request);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = (await request.json().catch(() => null)) as { id?: unknown } | null;
  if (typeof b?.id !== "string" || !UUID.test(b.id)) return NextResponse.json({ error: "Invalid withdrawal." }, { status: 400 });
  const { error } = await createSupabaseAdmin()
    .from("bank_withdrawals").update({ status: "canceled" }).eq("id", b.id).eq("user_id", user.id).eq("status", "pending");
  if (error) return NextResponse.json({ error: "Could not cancel." }, { status: 503 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
