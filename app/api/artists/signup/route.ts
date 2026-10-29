import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isArtistTier } from "../../../../lib/artist-tiers";
import { persistHostIdentity } from "../../../../lib/host-profile";
import { generateUniqueUsername } from "../../../../lib/artist-username";
import {
  createHostSessionToken,
  HOST_SESSION_COOKIE,
  HOST_SESSION_MAX_AGE,
  hostProfileId,
} from "../../../../lib/host-session";

function hasSameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_APP_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_APP_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Artist signup is not configured." }, { status: 503 });
  }

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Google signup could not be verified." }, { status: 400 });
  }
  const values = input && typeof input === "object"
    ? input as { accessToken?: unknown; planTier?: unknown }
    : {};
  if (typeof values.accessToken !== "string" || values.accessToken.length > 8192 || !isArtistTier(values.planTier)) {
    return NextResponse.json({ error: "Choose a plan and complete Google signup." }, { status: 400 });
  }

  try {
    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase.auth.getUser(values.accessToken);
    const user = data.user;
    const email = user?.email?.trim().toLowerCase();
    if (error || !user || user.app_metadata.provider !== "google" || !email || !user.email_confirmed_at) {
      return NextResponse.json({ error: "Use a verified Google account to sign up." }, { status: 401 });
    }

    const hostId = hostProfileId("google", email);
    const accountStatus = await persistHostIdentity(hostId, "google", email);
    if (accountStatus !== "active") {
      return NextResponse.json({ error: "This artist account is suspended." }, { status: 403 });
    }
    // Assign a unique searchable handle on first signup; existing artists keep theirs.
    const { createSupabaseAdmin } = await import("../../../../lib/supabase-admin");
    const existingProfile = await createSupabaseAdmin()
      .from("host_profiles")
      .select("username")
      .eq("host_id", hostId)
      .maybeSingle();
    const username = existingProfile.data?.username as string | undefined
      ?? await generateUniqueUsername(email.split("@")[0]);
    const { error: profileError } = await supabaseAdminProfile(hostId, values.planTier, username);
    if (profileError) {
      return NextResponse.json({ error: "Artist profile storage is not configured." }, { status: 503 });
    }

    const response = NextResponse.json({ created: true });
    response.cookies.set(HOST_SESSION_COOKIE, createHostSessionToken(hostId), {
      httpOnly: true,
      maxAge: HOST_SESSION_MAX_AGE,
      path: "/",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Artist signup is temporarily unavailable." }, { status: 503 });
  }
}

async function supabaseAdminProfile(hostId: string, planTier: string, username?: string) {
  const { createSupabaseAdmin } = await import("../../../../lib/supabase-admin");
  return createSupabaseAdmin().from("host_profiles").upsert(
    {
      host_id: hostId,
      plan_tier: planTier,
      subscription_status: planTier === "free" ? "active" : "pending",
      ...(username ? { username } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "host_id" },
  );
}