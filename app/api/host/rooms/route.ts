import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { HOST_SESSION_COOKIE } from "../../../../lib/host-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { readActiveHostSession } from "../../../../lib/host-profile";
import { artistTierDetails, effectiveArtistTier, isArtistTier } from "../../../../lib/artist-tiers";
import { getPlatformSettings } from "../../../../lib/platform-settings";

function hasSameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const session = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });
  }

  try {
    const { data, error } = await createSupabaseAdmin()
      .from("rooms")
      .select("id, title, slug, status, max_listeners, created_at")
      .eq("host_id", session.hostId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: "Could not load rooms." }, { status: 503 });
    return NextResponse.json({ rooms: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Room service is not configured." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const session = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });
  }

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Enter a room title." }, { status: 400 });
  }
  const values = input && typeof input === "object" ? input as { title?: unknown } : {};
  const title = typeof values.title === "string" ? values.title.trim() : "";
  if (!title || title.length > 100) {
    return NextResponse.json({ error: "Enter a room title up to 100 characters." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("host_profiles")
      .select("plan_tier, subscription_status")
      .eq("host_id", session.hostId)
      .maybeSingle();
    if (profileError) return NextResponse.json({ error: "Could not load artist tier." }, { status: 503 });
    const requestedTier = isArtistTier(profile?.plan_tier) ? profile.plan_tier : "free";
    const effectiveTier = effectiveArtistTier(requestedTier, profile?.subscription_status ?? "active");
    const maxListeners = artistTierDetails(effectiveTier).maxListeners;
    const platformSettings = await getPlatformSettings();
    const inviteCode = randomBytes(24).toString("base64url");
    const inviteCodeHash = createHash("sha256").update(inviteCode).digest("hex");
    const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "room";
    const slug = `${titleSlug}-${randomBytes(4).toString("hex")}`;
    const { data: room, error } = await supabase
      .from("rooms")
      .insert({
        title,
        slug,
        invite_code_hash: inviteCodeHash,
        host_id: session.hostId,
        max_listeners: maxListeners,
        status: platformSettings.new_room_status,
      })
      .select("id, title, slug, status, created_at")
      .single();

    if (error || !room) {
      return NextResponse.json({ error: "Room could not be created." }, { status: 503 });
    }

    const { error: stateError } = await supabase
      .from("room_state")
      .insert({ room_id: room.id, status: "paused", position_seconds: 0 });
    if (stateError) {
      await supabase.from("rooms").delete().eq("id", room.id);
      return NextResponse.json({ error: "Room state could not be initialized." }, { status: 503 });
    }

    return NextResponse.json({ room, inviteCode }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Room service is not configured." }, { status: 503 });
  }
}