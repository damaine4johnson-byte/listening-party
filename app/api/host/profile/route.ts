import { NextRequest, NextResponse } from "next/server";
import { HOST_SESSION_COOKIE, readHostSession } from "../../../../lib/host-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { isArtistTier } from "../../../../lib/artist-tiers";

function getSession(request: NextRequest) {
  return readHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
}

function hasSameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  try {
    const supabase = createSupabaseAdmin();
    const [accountResult, profileResult] = await Promise.all([
      supabase
        .from("host_accounts")
        .select("auth_provider, account_identity")
        .eq("host_id", session.hostId)
        .maybeSingle(),
      supabase
        .from("host_profiles")
        .select("display_name, bio, avatar_url, contact_email, plan_tier, subscription_status")
        .eq("host_id", session.hostId)
        .maybeSingle(),
    ]);

    if (accountResult.error || !accountResult.data || profileResult.error) {
      return NextResponse.json({ error: "Could not load host profile." }, { status: 503 });
    }

    return NextResponse.json({
      account: accountResult.data,
      profile: profileResult.data ?? {
        display_name: "", bio: "", avatar_url: "", contact_email: "",
        plan_tier: "free", subscription_status: "active",
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Host profile storage is not configured." }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Profile details are invalid." }, { status: 400 });
  }

  const values = input && typeof input === "object"
    ? input as { displayName?: unknown; bio?: unknown; avatarUrl?: unknown; contactEmail?: unknown; planTier?: unknown }
    : {};
  const displayName = typeof values.displayName === "string" ? values.displayName.trim() : "";
  const bio = typeof values.bio === "string" ? values.bio.trim() : "";
  const avatarUrl = typeof values.avatarUrl === "string" ? values.avatarUrl.trim() : "";
  const contactEmail = typeof values.contactEmail === "string" ? values.contactEmail.trim() : "";
  const planTier = values.planTier;

  if (
    !displayName || displayName.length > 80 || bio.length > 400 ||
    avatarUrl.length > 2048 || contactEmail.length > 320 || !isArtistTier(planTier)
  ) {
    return NextResponse.json({ error: "Check the profile field lengths and required display name." }, { status: 400 });
  }
  if (avatarUrl) {
    try {
      if (new URL(avatarUrl).protocol !== "https:") throw new Error("HTTPS is required.");
    } catch {
      return NextResponse.json({ error: "Avatar URL must be a valid HTTPS URL." }, { status: 400 });
    }
  }
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return NextResponse.json({ error: "Enter a valid contact email address." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data: currentProfile, error: currentProfileError } = await supabase
      .from("host_profiles")
      .select("plan_tier, subscription_status")
      .eq("host_id", session.hostId)
      .maybeSingle();
    if (currentProfileError) {
      return NextResponse.json({ error: "Could not load current artist tier." }, { status: 503 });
    }

    const planChanged = currentProfile?.plan_tier !== planTier;
    const subscriptionStatus = planChanged
      ? planTier === "free" ? "active" : "pending"
      : currentProfile?.subscription_status ?? (planTier === "free" ? "active" : "pending");
    const { error } = await supabase.from("host_profiles").upsert(
      {
        host_id: session.hostId,
        display_name: displayName,
        bio,
        avatar_url: avatarUrl,
        contact_email: contactEmail,
        plan_tier: planTier,
        subscription_status: subscriptionStatus,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "host_id" },
    );
    if (error) return NextResponse.json({ error: "Could not save host profile." }, { status: 503 });
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "Host profile storage is not configured." }, { status: 503 });
  }
}