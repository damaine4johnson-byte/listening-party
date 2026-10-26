import { NextRequest, NextResponse } from "next/server";
import { audit, authorize } from "../../../../lib/admin-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { getPlatformSettings } from "../../../../lib/platform-settings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ settings: await getPlatformSettings() });
}

export async function PATCH(request: NextRequest) {
  const auth = await authorize(request, "admin", true);
  if ("response" in auth) return auth.response;

  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (b.free_tier_ads_enabled !== undefined) {
    if (typeof b.free_tier_ads_enabled !== "boolean") return NextResponse.json({ error: "Invalid ads flag." }, { status: 400 });
    update.free_tier_ads_enabled = b.free_tier_ads_enabled;
  }
  for (const [key, max] of [["free_tier_ad_title", 120], ["free_tier_ad_body", 400], ["free_tier_ad_href", 300]] as const) {
    if (b[key] === undefined) continue;
    const v = b[key];
    if (typeof v !== "string" || v.trim().length === 0 || v.length > max) return NextResponse.json({ error: `Invalid ${key}.` }, { status: 400 });
    // Ad links must be same-site paths or https URLs.
    if (key === "free_tier_ad_href" && !/^(\/(?!\/)|https:\/\/)/.test(v)) return NextResponse.json({ error: "Ad link must start with / or https://." }, { status: 400 });
    update[key] = v.trim();
  }
  if (b.new_room_status !== undefined) {
    if (b.new_room_status !== "scheduled" && b.new_room_status !== "live") return NextResponse.json({ error: "Invalid room status." }, { status: 400 });
    update.new_room_status = b.new_room_status;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const { error } = await createSupabaseAdmin()
    .from("platform_settings")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("setting_key", "global");
  if (error) return NextResponse.json({ error: "Could not save settings." }, { status: 503 });
  await audit(auth.admin.username, "settings_update", "global", update);
  return NextResponse.json({ settings: await getPlatformSettings() });
}
