import { NextRequest, NextResponse } from "next/server";
import { HOST_SESSION_COOKIE } from "../../../../lib/host-session";
import { readActiveHostSession } from "../../../../lib/host-profile";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { artistTierDetails, effectiveArtistTier, isArtistTier } from "../../../../lib/artist-tiers";
import { isWipayConfigured, MAX_ENTRY_FEE_CENTS, MIN_ENTRY_FEE_CENTS, PLATFORM_FEE_PERCENT } from "../../../../lib/wipay";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function hasSameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

async function loadHost(hostId: string) {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("host_profiles")
    .select("plan_tier, subscription_status, paypal_email")
    .eq("host_id", hostId)
    .maybeSingle();
  if (error) throw error;
  const requestedTier = isArtistTier(data?.plan_tier) ? data.plan_tier : "free";
  const tier = effectiveArtistTier(requestedTier, data?.subscription_status ?? "active");
  return { canChargeEntry: artistTierDetails(tier).paidRooms, paypalEmail: (data?.paypal_email as string | null) ?? null };
}

export async function GET(request: NextRequest) {
  const session = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  try {
    const host = await loadHost(session.hostId);
    const { data: earnings } = await createSupabaseAdmin()
      .from("host_earnings")
      .select("net_cents, paid_out_at")
      .eq("host_id", session.hostId)
      .limit(10_000);
    const rows = earnings ?? [];
    return NextResponse.json({
      canChargeEntry: host.canChargeEntry,
      paymentsConfigured: isWipayConfigured(),
      paypalEmail: host.paypalEmail,
      ready: isWipayConfigured() && Boolean(host.paypalEmail),
      pendingCents: rows.filter((row) => !row.paid_out_at).reduce((sum, row) => sum + row.net_cents, 0),
      paidCents: rows.filter((row) => row.paid_out_at).reduce((sum, row) => sum + row.net_cents, 0),
      platformFeePercent: PLATFORM_FEE_PERCENT,
      minEntryFeeCents: MIN_ENTRY_FEE_CENTS,
      maxEntryFeeCents: MAX_ENTRY_FEE_CENTS,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load payout settings." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const session = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Enter your PayPal email." }, { status: 400 });
  }
  const email = input && typeof input === "object" && typeof (input as { paypalEmail?: unknown }).paypalEmail === "string"
    ? (input as { paypalEmail: string }).paypalEmail.trim().toLowerCase()
    : "";
  if (!EMAIL.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid PayPal email." }, { status: 400 });
  }

  try {
    const { data: saved, error } = await createSupabaseAdmin()
      .from("host_profiles")
      .update({ paypal_email: email })
      .eq("host_id", session.hostId)
      .select("host_id");
    if (error || !saved?.length) return NextResponse.json({ error: "Could not save your PayPal email." }, { status: 503 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not save your PayPal email." }, { status: 503 });
  }
}
