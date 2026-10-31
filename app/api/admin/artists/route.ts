import { NextRequest, NextResponse } from "next/server";
import { audit, authorize } from "../../../../lib/admin-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

const PLANS = ["free", "tier2", "tier3", "tier4"];
const SUBSCRIPTIONS = ["active", "pending", "canceled"];

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
  const db = createSupabaseAdmin();
  const [accounts, profiles, rooms, usernames] = await Promise.all([
    db.from("host_accounts").select("host_id, auth_provider, account_identity, account_status, created_at").order("created_at", { ascending: false }).limit(500),
    db.from("host_profiles").select("host_id, display_name, bio, contact_email, plan_tier, subscription_status").limit(500),
    db.from("rooms").select("host_id").limit(10_000),
    db.from("artist_usernames").select("username, host_id").limit(1_000).then((r) => (r.error ? { data: [] } : r)),
  ]);
  if (accounts.error || profiles.error) return NextResponse.json({ error: "Could not load artists." }, { status: 503 });

  const profileById = new Map((profiles.data ?? []).map((p) => [p.host_id, p]));
  const usernameByHost = new Map((usernames.data ?? []).map((u) => [u.host_id, u.username]));
  const roomCounts = new Map<string, number>();
  for (const r of rooms.data ?? []) if (r.host_id) roomCounts.set(r.host_id, (roomCounts.get(r.host_id) ?? 0) + 1);

  return NextResponse.json({
    artists: (accounts.data ?? []).map((a) => ({
      ...a,
      profile: profileById.get(a.host_id) ?? null,
      username: usernameByHost.get(a.host_id) ?? null,
      roomCount: roomCounts.get(a.host_id) ?? 0,
    })),
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await authorize(request, "admin", true);
  if ("response" in auth) return auth.response;
  const db = createSupabaseAdmin();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const hostId = body?.hostId;
  if (typeof hostId !== "string" || !/^[a-f0-9]{64}$/.test(hostId)) {
    return NextResponse.json({ error: "Invalid artist." }, { status: 400 });
  }
  const now = new Date().toISOString();

  if (body?.accountStatus !== undefined) {
    if (body.accountStatus !== "active" && body.accountStatus !== "suspended") {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    const { error } = await db.from("host_accounts").update({ account_status: body.accountStatus, updated_at: now }).eq("host_id", hostId);
    if (error) return NextResponse.json({ error: "Could not update artist." }, { status: 503 });
  }

  const profile: Record<string, string> = {};
  if (body?.planTier !== undefined) {
    if (typeof body.planTier !== "string" || !PLANS.includes(body.planTier)) return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
    profile.plan_tier = body.planTier;
  }
  if (body?.subscriptionStatus !== undefined) {
    if (typeof body.subscriptionStatus !== "string" || !SUBSCRIPTIONS.includes(body.subscriptionStatus)) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
    profile.subscription_status = body.subscriptionStatus;
  }
  for (const [key, field, max] of [["displayName", "display_name", 80], ["bio", "bio", 400]] as const) {
    const value = body?.[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > max) return NextResponse.json({ error: `Invalid ${key}.` }, { status: 400 });
    profile[field] = value.trim();
  }
  if (Object.keys(profile).length > 0) {
    const { error } = await db.from("host_profiles").update({ ...profile, updated_at: now }).eq("host_id", hostId);
    if (error) return NextResponse.json({ error: "Could not update artist profile." }, { status: 503 });
  }
  const { hostId: _h, ...changes } = body ?? {};
  await audit(auth.admin.username, "artist_update", hostId, changes);
  return NextResponse.json({ ok: true });
}

// Admins can free a username an artist no longer holds — e.g. to resolve a
// "this username is taken" dispute or clear a stale claim.
export async function DELETE(request: NextRequest) {
  const auth = await authorize(request, "admin", true);
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const hostId = body?.hostId;
  if (typeof hostId !== "string" || !/^[a-f0-9]{64}$/.test(hostId)) {
    return NextResponse.json({ error: "Invalid artist." }, { status: 400 });
  }

  const db = createSupabaseAdmin();
  const { data: existing } = await db.from("artist_usernames").select("username").eq("host_id", hostId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "This artist has no username." }, { status: 404 });

  const { error } = await db.from("artist_usernames").delete().eq("host_id", hostId);
  if (error) return NextResponse.json({ error: "Could not remove the username." }, { status: 503 });
  await audit(auth.admin.username, "artist_username_removed", hostId, { username: existing.username });
  return NextResponse.json({ ok: true, username: existing.username });
}
