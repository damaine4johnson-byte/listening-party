import { createHash, randomBytes } from "node:crypto";
import { generateInviteCode, normalizeInviteCode } from "../../../../lib/invite-code";
import { NextRequest, NextResponse } from "next/server";
import { HOST_SESSION_COOKIE } from "../../../../lib/host-session";
import { notifyFollowers } from "../../../../lib/follow-notify";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { readActiveHostSession } from "../../../../lib/host-profile";
import { getRoomCoverUrls, roomCoverPath } from "../../../../lib/room-cover";
import { artistTierDetails, effectiveArtistTier, isArtistTier } from "../../../../lib/artist-tiers";
import { getPlatformSettings } from "../../../../lib/platform-settings";
import { isWipayConfigured, MAX_ENTRY_FEE_CENTS, MIN_ENTRY_FEE_CENTS } from "../../../../lib/wipay";

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
      .select("id, title, description, slug, status, max_listeners, entry_fee_cents, created_at")
      .eq("host_id", session.hostId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: "Could not load rooms." }, { status: 503 });
    const supabase = createSupabaseAdmin();
    const covers = await getRoomCoverUrls(supabase, (data ?? []).map((room) => room.id as string));
    const rooms = (data ?? []).map((room) => ({ ...room, coverUrl: covers.get(room.id as string) ?? null }));
    return NextResponse.json({ rooms }, { headers: { "Cache-Control": "no-store" } });
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
  const values = input && typeof input === "object" ? input as { title?: unknown; description?: unknown; entryFeeCents?: unknown } : {};
  const title = typeof values.title === "string" ? values.title.trim() : "";
  const description = typeof values.description === "string" ? values.description.trim() : "";
  if (!title || title.length > 100 || description.length > 500) {
    return NextResponse.json({ error: "Enter a room title up to 100 characters." }, { status: 400 });
  }
  const entryFeeCents = values.entryFeeCents === undefined || values.entryFeeCents === null ? 0 : values.entryFeeCents;
  if (
    typeof entryFeeCents !== "number" || !Number.isInteger(entryFeeCents) ||
    (entryFeeCents !== 0 && (entryFeeCents < MIN_ENTRY_FEE_CENTS || entryFeeCents > MAX_ENTRY_FEE_CENTS))
  ) {
    return NextResponse.json({ error: "Entry fee must be between $1 and $1,000." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("host_profiles")
      .select("plan_tier, subscription_status, paypal_email")
      .eq("host_id", session.hostId)
      .maybeSingle();
    if (profileError) return NextResponse.json({ error: "Could not load artist tier." }, { status: 503 });
    const requestedTier = isArtistTier(profile?.plan_tier) ? profile.plan_tier : "free";
    const effectiveTier = effectiveArtistTier(requestedTier, profile?.subscription_status ?? "active");
    const maxListeners = artistTierDetails(effectiveTier).maxListeners;
    if (entryFeeCents > 0) {
      if (!artistTierDetails(effectiveTier).paidRooms) {
        return NextResponse.json({ error: "Paid entry rooms require an active Tier 2 or higher plan." }, { status: 403 });
      }
      const payoutsReady = isWipayConfigured() && Boolean(profile?.paypal_email);
      if (!payoutsReady) {
        return NextResponse.json({ error: "Finish payout setup before creating a paid room." }, { status: 403 });
      }
    }
    const platformSettings = await getPlatformSettings();
    const inviteCode = generateInviteCode();
    const inviteCodeHash = createHash("sha256").update(normalizeInviteCode(inviteCode)).digest("hex");
    const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "room";
    const slug = `${titleSlug}-${randomBytes(4).toString("hex")}`;
    const { data: room, error } = await supabase
      .from("rooms")
      .insert({
        title,
        description,
        slug,
        invite_code_hash: inviteCodeHash,
        host_id: session.hostId,
        max_listeners: maxListeners,
        entry_fee_cents: entryFeeCents,
        status: platformSettings.new_room_status,
      })
      .select("id, title, description, slug, status, max_listeners, entry_fee_cents, created_at")
      .single();

    if (error || !room) {
      return NextResponse.json({ error: "Room could not be created." }, { status: 503 });
    }

    // Best effort: readers treat a missing room_state row as "paused", so a failure here must
    // not report the (already created) room as failed.
    await supabase
      .from("room_state")
      .upsert({ room_id: room.id, status: "paused", position_seconds: 0 }, { onConflict: "room_id", ignoreDuplicates: true });
    // Stored so the host can view the code again; requires supabase/invite_code_display.sql.
    await supabase.from("rooms").update({ invite_code: inviteCode }).eq("id", room.id);
    if (room.status !== "ended") await notifyFollowers(session.hostId, room, inviteCode, room.status === "live");

    return NextResponse.json({ room, inviteCode }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Room service is not configured." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const session = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  const input = await request.json().catch(() => null) as
    { roomId?: unknown; title?: unknown; description?: unknown; entryFeeCents?: unknown; status?: unknown } | null;
  const roomId = typeof input?.roomId === "string" ? input.roomId : "";
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return NextResponse.json({ error: "Choose a room." }, { status: 400 });

  const updates: Record<string, string | number> = {};
  if (input?.title !== undefined) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title || title.length > 100) return NextResponse.json({ error: "Enter a room title up to 100 characters." }, { status: 400 });
    updates.title = title;
  }
  if (input?.description !== undefined) {
    const description = typeof input.description === "string" ? input.description.trim() : "";
    if (description.length > 500) return NextResponse.json({ error: "Description can be up to 500 characters." }, { status: 400 });
    updates.description = description;
  }
  if (input?.status !== undefined) {
    if (input.status !== "scheduled" && input.status !== "live" && input.status !== "ended") {
      return NextResponse.json({ error: "Choose a valid room status." }, { status: 400 });
    }
    updates.status = input.status;
  }
  const fee = input?.entryFeeCents;
  if (fee !== undefined) {
    if (typeof fee !== "number" || !Number.isInteger(fee) || (fee !== 0 && (fee < MIN_ENTRY_FEE_CENTS || fee > MAX_ENTRY_FEE_CENTS))) {
      return NextResponse.json({ error: "Entry fee must be between $1 and $1,000." }, { status: 400 });
    }
    updates.entry_fee_cents = fee;
  }
  if (!Object.keys(updates).length) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  try {
    const supabase = createSupabaseAdmin();
    const { data: current, error: currentError } = await supabase
      .from("rooms")
      .select("entry_fee_cents, status")
      .eq("id", roomId)
      .eq("host_id", session.hostId)
      .maybeSingle();
    if (currentError) return NextResponse.json({ error: "Room service is temporarily unavailable." }, { status: 503 });
    if (!current) return NextResponse.json({ error: "Room not found." }, { status: 404 });

    if (typeof updates.entry_fee_cents === "number" && updates.entry_fee_cents > 0 && updates.entry_fee_cents !== current.entry_fee_cents) {
      const { data: profile } = await supabase
        .from("host_profiles")
        .select("plan_tier, subscription_status, paypal_email")
        .eq("host_id", session.hostId)
        .maybeSingle();
      const tier = effectiveArtistTier(isArtistTier(profile?.plan_tier) ? profile.plan_tier : "free", profile?.subscription_status ?? "active");
      if (!artistTierDetails(tier).paidRooms) {
        return NextResponse.json({ error: "Paid entry rooms require an active Tier 2 or higher plan." }, { status: 403 });
      }
      if (!(isWipayConfigured() && profile?.paypal_email)) {
        return NextResponse.json({ error: "Finish payout setup before charging an entry fee." }, { status: 403 });
      }
    }

    const { data: room, error } = await supabase
      .from("rooms")
      .update(updates)
      .eq("id", roomId)
      .eq("host_id", session.hostId)
      .select("id, title, description, slug, status, max_listeners, entry_fee_cents, created_at")
      .single();
    if (error || !room) return NextResponse.json({ error: "Room could not be updated." }, { status: 503 });
    if (room.status === "live" && current.status !== "live") {
      // invite_code needs supabase/invite_code_display.sql; without it followers simply are not notified.
      const { data: codeRow } = await supabase.from("rooms").select("invite_code").eq("id", roomId).maybeSingle();
      const code = (codeRow as { invite_code?: string | null } | null)?.invite_code;
      if (code) await notifyFollowers(session.hostId, room, code, true);
    }
    return NextResponse.json({ room }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Room service is not configured." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const session = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  const input = await request.json().catch(() => null) as { roomId?: unknown } | null;
  const roomId = typeof input?.roomId === "string" ? input.roomId : "";
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return NextResponse.json({ error: "Choose a room." }, { status: 400 });

  try {
    const supabase = createSupabaseAdmin();
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, status")
      .eq("id", roomId)
      .eq("host_id", session.hostId)
      .maybeSingle();
    if (roomError) return NextResponse.json({ error: "Room service is temporarily unavailable." }, { status: 503 });
    if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    if (room.status === "live") {
      return NextResponse.json({ error: "End the live stream before deleting this room." }, { status: 409 });
    }

    const { data: tracks } = await supabase.from("room_tracks").select("storage_path").eq("room_id", roomId);
    const { error } = await supabase.from("rooms").delete().eq("id", roomId).eq("host_id", session.hostId);
    if (error) return NextResponse.json({ error: "Room could not be deleted." }, { status: 503 });

    const paths = (tracks ?? []).map((track) => track.storage_path).filter(Boolean);
    if (paths.length) await supabase.storage.from("tracks").remove(paths);
    await supabase.storage.from("avatars").remove([roomCoverPath(roomId)]);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Room service is not configured." }, { status: 503 });
  }
}
