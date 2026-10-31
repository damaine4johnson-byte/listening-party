import { NextRequest, NextResponse } from "next/server";
import { HOST_SESSION_COOKIE } from "../../../../lib/host-session";
import { readActiveHostSession } from "../../../../lib/host-profile";
import { followerCount, handleOf } from "../../../../lib/artists-public";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { isArtistTier } from "../../../../lib/artist-tiers";
import { claimUsername, usernameForHost, USERNAME_PATTERN } from "../../../../lib/artist-username";

async function getSession(request: NextRequest) {
  return readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
}

function hasSameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  try {
    const supabase = createSupabaseAdmin();
    const currentUsername = await usernameForHost(session.hostId).catch(() => null);
    const [accountResult, profileResult] = await Promise.all([
      supabase
        .from("host_accounts")
        .select("auth_provider, account_identity")
        .eq("host_id", session.hostId)
        .maybeSingle(),
      supabase
        .from("host_profiles")
        .select("display_name, bio, avatar_url, contact_email, link_in_bio, plan_tier, subscription_status")
        .eq("host_id", session.hostId)
        .maybeSingle()
        .then(async (r) => {
          // Older projects may not have link_in_bio yet (supabase/link_in_bio.sql).
          if (r.error?.code === "42703") {
            return supabase
              .from("host_profiles")
              .select("display_name, bio, avatar_url, contact_email, plan_tier, subscription_status")
              .eq("host_id", session.hostId)
              .maybeSingle();
          }
          return r;
        }),
    ]);

    if (accountResult.error || !accountResult.data || profileResult.error) {
      return NextResponse.json({ error: "Could not load host profile." }, { status: 503 });
    }

    const followers = await followerCount(session.hostId).catch(() => 0);
    const profile = (profileResult.data ?? null) as Record<string, unknown> | null;
    return NextResponse.json({
      followers,
      handle: currentUsername || handleOf(session.hostId),
      username: currentUsername,
      profileUrl: currentUsername ? `/artists/${currentUsername}` : null,
      account: accountResult.data,
      profile: profile ?? {
        display_name: "", bio: "", avatar_url: "", contact_email: "", link_in_bio: "",
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
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Profile details are invalid." }, { status: 400 });
  }

  const values = input && typeof input === "object"
    ? input as { displayName?: unknown; bio?: unknown; avatarUrl?: unknown; contactEmail?: unknown; linkInBio?: unknown; planTier?: unknown; username?: unknown }
    : {};
  const displayName = typeof values.displayName === "string" ? values.displayName.trim() : "";
  const bio = typeof values.bio === "string" ? values.bio.trim() : "";
  const avatarUrl = typeof values.avatarUrl === "string" ? values.avatarUrl.trim() : "";
  const contactEmail = typeof values.contactEmail === "string" ? values.contactEmail.trim() : "";
  const linkInBio = typeof values.linkInBio === "string" ? values.linkInBio.trim() : "";
  const planTier = values.planTier;
  const requestedUsername = typeof values.username === "string" ? values.username.trim().toLowerCase() : null;

  if (
    !displayName || displayName.length > 80 || bio.length > 400 ||
    avatarUrl.length > 2048 || contactEmail.length > 320 || linkInBio.length > 300 || !isArtistTier(planTier)
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
  if (linkInBio) {
    try {
      const parsed = new URL(linkInBio);
      if (parsed.protocol !== "https:") throw new Error("HTTPS required.");
    } catch {
      return NextResponse.json({ error: "Link in bio must be a valid HTTPS URL." }, { status: 400 });
    }
  }

  try {
    const supabase = createSupabaseAdmin();
    // The account identity (their Google email) lets a user who already holds a
    // username as a listener reclaim it as their artist handle.
    const { data: identityRow } = await supabase
      .from("host_accounts")
      .select("account_identity")
      .eq("host_id", session.hostId)
      .maybeSingle();
    const accountResultEmail = typeof identityRow?.account_identity === "string" ? identityRow.account_identity : undefined;
    const { data: currentProfileRaw, error: currentProfileError } = await supabase
      .from("host_profiles")
      .select("plan_tier, subscription_status")
      .eq("host_id", session.hostId)
      .maybeSingle();
    if (currentProfileError) {
      return NextResponse.json({ error: "Could not load current artist tier." }, { status: 503 });
    }
    const currentProfile = currentProfileRaw as { plan_tier?: string; subscription_status?: string } | null;

    // Username changes: only apply when the artist actually typed a new one,
    // and keep the DB-level uniqueness check as the source of truth.
    let usernameUpdate: string | undefined;
    if (requestedUsername) {
      const current = await usernameForHost(session.hostId).catch(() => null);
      if (requestedUsername !== current) {
        if (!USERNAME_PATTERN.test(requestedUsername)) {
          return NextResponse.json({ error: "Usernames are 3-24 characters: lowercase letters, numbers and underscores, starting with a letter." }, { status: 400 });
        }
        const ownerEmail = typeof contactEmail === "string" && contactEmail ? contactEmail : accountResultEmail;
        if ((await claimUsername(session.hostId, requestedUsername, ownerEmail)) !== "ok") {
          return NextResponse.json({ error: "That username is taken. Try another." }, { status: 409 });
        }
        usernameUpdate = requestedUsername;
      }
    }

    const planChanged = currentProfile?.plan_tier !== planTier;
    const subscriptionStatus = planChanged
      ? planTier === "free" ? "active" : "pending"
      : currentProfile?.subscription_status ?? (planTier === "free" ? "active" : "pending");
    const upsertRow: Record<string, unknown> = {
      host_id: session.hostId,
      display_name: displayName,
      bio,
      avatar_url: avatarUrl,
      contact_email: contactEmail,
      plan_tier: planTier,
      subscription_status: subscriptionStatus,
      updated_at: new Date().toISOString(),
    };
    if (linkInBio) upsertRow.link_in_bio = linkInBio; // skipped when the column hasn't been added yet
    const { error } = await supabase.from("host_profiles").upsert(upsertRow, { onConflict: "host_id" });
    if (error) {
      return NextResponse.json({ error: "Could not save host profile." }, { status: 503 });
    }
    return NextResponse.json({ saved: true, ...(usernameUpdate ? { username: usernameUpdate } : {}) });
  } catch {
    return NextResponse.json({ error: "Host profile storage is not configured." }, { status: 503 });
  }
}