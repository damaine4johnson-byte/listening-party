import { NextRequest, NextResponse } from "next/server";
import { isArtistTier } from "../../../../lib/artist-tiers";
import { ADMIN_SESSION_COOKIE, readAdminSession } from "../../../../lib/admin-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

function isAdmin(request: NextRequest) {
  return Boolean(readAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value));
}

function hasSameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  if (!isAdmin(request)) return NextResponse.json({ error: "Developer admin sign-in required." }, { status: 401 });

  try {
    const { data, error } = await createSupabaseAdmin()
      .from("host_accounts")
      .select("host_id, auth_provider, account_identity, account_status, host_profiles(display_name, contact_email, plan_tier, subscription_status)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: "Could not load artist accounts." }, { status: 503 });

    const artists = (data ?? []).map((account) => {
      const profile = Array.isArray(account.host_profiles) ? account.host_profiles[0] : account.host_profiles;
      return {
        hostId: account.host_id,
        identity: account.account_identity,
        provider: account.auth_provider,
        accountStatus: account.account_status,
        displayName: profile?.display_name ?? "",
        contactEmail: profile?.contact_email ?? "",
        planTier: profile?.plan_tier ?? "free",
        subscriptionStatus: profile?.subscription_status ?? "active",
      };
    });
    return NextResponse.json({ artists }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Artist account service is not configured." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  if (!isAdmin(request)) return NextResponse.json({ error: "Developer admin sign-in required." }, { status: 401 });

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Artist settings are invalid." }, { status: 400 });
  }
  const values = input && typeof input === "object"
    ? input as { hostId?: unknown; accountStatus?: unknown; planTier?: unknown; subscriptionStatus?: unknown }
    : {};
  if (
    typeof values.hostId !== "string" || !/^[a-f0-9]{64}$/.test(values.hostId) ||
    (values.accountStatus !== undefined && values.accountStatus !== "active" && values.accountStatus !== "suspended") ||
    (values.planTier !== undefined && !isArtistTier(values.planTier)) ||
    (values.subscriptionStatus !== undefined && !["active", "pending", "canceled"].includes(String(values.subscriptionStatus))) ||
    (values.accountStatus === undefined && values.planTier === undefined && values.subscriptionStatus === undefined)
  ) {
    return NextResponse.json({ error: "Choose valid artist access and plan settings." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    if (values.accountStatus !== undefined) {
      const { data, error } = await supabase
        .from("host_accounts")
        .update({ account_status: values.accountStatus, updated_at: new Date().toISOString() })
        .eq("host_id", values.hostId)
        .select("host_id")
        .maybeSingle();
      if (error) return NextResponse.json({ error: "Could not update artist access." }, { status: 503 });
      if (!data) return NextResponse.json({ error: "Artist account was not found." }, { status: 404 });
    }

    if (values.planTier !== undefined || values.subscriptionStatus !== undefined) {
      const { data: existing, error: existingError } = await supabase
        .from("host_profiles")
        .select("display_name, bio, avatar_url, contact_email, plan_tier, subscription_status")
        .eq("host_id", values.hostId)
        .maybeSingle();
      if (existingError) return NextResponse.json({ error: "Could not load artist plan." }, { status: 503 });

      const planTier = values.planTier ?? existing?.plan_tier ?? "free";
      const subscriptionStatus = values.subscriptionStatus ?? existing?.subscription_status ?? (planTier === "free" ? "active" : "pending");
      const { error } = await supabase.from("host_profiles").upsert({
        host_id: values.hostId,
        display_name: existing?.display_name ?? "",
        bio: existing?.bio ?? "",
        avatar_url: existing?.avatar_url ?? "",
        contact_email: existing?.contact_email ?? "",
        plan_tier: planTier,
        subscription_status: subscriptionStatus,
        updated_at: new Date().toISOString(),
      }, { onConflict: "host_id" });
      if (error) return NextResponse.json({ error: "Could not update artist plan." }, { status: 503 });
    }

    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "Artist settings service is not configured." }, { status: 503 });
  }
}