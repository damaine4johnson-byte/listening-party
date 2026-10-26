import { NextRequest, NextResponse } from "next/server";
import { getListenerUser } from "../../../../lib/listener-auth";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export async function GET(request: NextRequest) {
  const user = await getListenerUser(request);
  if (!user) return NextResponse.json({ error: "Sign in with Google to view your coin wallet." }, { status: 401 });

  try {
    const { data, error } = await createSupabaseAdmin()
      .from("listener_coin_wallets")
      .select("balance_coins")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      console.error("Listener coin balance lookup failed", { code: error.code ?? "unknown" });
      return NextResponse.json({ error: "Could not load your coin balance." }, { status: 503 });
    }
    return NextResponse.json({ balance: data?.balance_coins ?? 0, coinsPerUsd: 10 }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Coin wallet is not configured." }, { status: 503 });
  }
}
