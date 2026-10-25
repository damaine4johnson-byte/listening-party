import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { isPayPalConfigured, sendPayPalPayouts } from "../../../../lib/paypal";

const MIN_PAYOUT_CENTS = 500;

function authorized(request: NextRequest) {
  const expected = process.env.PAYOUT_ADMIN_TOKEN;
  if (!expected || expected.length < 24) return false;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

// Platform-owner endpoint: pays every artist whose unpaid earnings reach the minimum, via PayPal Payouts.
// Call with `Authorization: Bearer $PAYOUT_ADMIN_TOKEN`. Add ?dryRun=1 to preview.
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  if (!dryRun && !isPayPalConfigured()) return NextResponse.json({ error: "PayPal is not configured." }, { status: 503 });

  const supabase = createSupabaseAdmin();
  const { data: earnings, error } = await supabase
    .from("host_earnings")
    .select("id, host_id, net_cents")
    .is("paid_out_at", null)
    .is("payout_batch_id", null)
    .limit(5_000);
  if (error) return NextResponse.json({ error: "Could not load earnings." }, { status: 503 });

  const totals = new Map<string, { cents: number; ids: string[] }>();
  for (const row of earnings ?? []) {
    const entry = totals.get(row.host_id) ?? { cents: 0, ids: [] };
    entry.cents += row.net_cents;
    entry.ids.push(row.id);
    totals.set(row.host_id, entry);
  }
  const hostIds = [...totals.entries()].filter(([, value]) => value.cents >= MIN_PAYOUT_CENTS).map(([id]) => id);
  if (!hostIds.length) return NextResponse.json({ paid: [], skipped: "No artist has reached the minimum payout." });

  const { data: profiles } = await supabase.from("host_profiles").select("host_id, paypal_email").in("host_id", hostIds);
  const emails = new Map((profiles ?? []).map((profile) => [profile.host_id as string, profile.paypal_email as string | null]));
  const payable = hostIds.filter((id) => emails.get(id));
  const missingEmail = hostIds.length - payable.length;
  if (!payable.length) return NextResponse.json({ paid: [], missingPayPalEmail: missingEmail });

  const preview = payable.map((id) => ({ hostId: id, amountCents: totals.get(id)!.cents }));
  if (dryRun) return NextResponse.json({ dryRun: true, wouldPay: preview, missingPayPalEmail: missingEmail });

  // Reserve the rows first so a retry can never pay the same earnings twice.
  const batchId = `fi-${randomUUID()}`;
  const reservedIds = payable.flatMap((id) => totals.get(id)!.ids);
  const { error: reserveError } = await supabase
    .from("host_earnings")
    .update({ payout_batch_id: batchId })
    .in("id", reservedIds)
    .is("payout_batch_id", null);
  if (reserveError) return NextResponse.json({ error: "Could not reserve earnings." }, { status: 503 });

  try {
    const result = await sendPayPalPayouts(batchId, payable.map((id) => ({
      senderItemId: `${batchId}-${id}`.slice(0, 63),
      email: emails.get(id)!,
      amountCents: totals.get(id)!.cents,
      note: "Earnings from Famous Introvert Listening Rooms",
    })));
    await supabase.from("host_earnings").update({ paid_out_at: new Date().toISOString() }).eq("payout_batch_id", batchId);
    return NextResponse.json({ paid: preview, batchId, paypalBatchId: result.paypalBatchId, missingPayPalEmail: missingEmail });
  } catch (cause) {
    // Leave rows reserved: PayPal may have accepted the batch, so a human should check before releasing.
    console.error("PayPal payout failed", { batchId });
    return NextResponse.json({
      error: cause instanceof Error ? cause.message : "PayPal payout failed.",
      batchId,
      note: "Earnings stay reserved under this batch id until you confirm in PayPal whether it was sent.",
    }, { status: 502 });
  }
}
