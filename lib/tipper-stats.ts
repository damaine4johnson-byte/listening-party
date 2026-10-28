import type { SupabaseClient } from "@supabase/supabase-js";

// Lifetime paid tip totals (in cents) per signed-in listener.
export async function lifetimeTipCents(supabase: SupabaseClient, userIds: string[]) {
  const totals = new Map<string, number>();
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return totals;
  const { data } = await supabase
    .from("payment_orders")
    .select("listener_user_id, amount_cents")
    .eq("kind", "tip")
    .eq("status", "paid")
    .in("listener_user_id", ids)
    .limit(10000);
  for (const row of data ?? []) {
    const id = row.listener_user_id as string;
    totals.set(id, (totals.get(id) ?? 0) + (row.amount_cents as number));
  }
  return totals;
}
