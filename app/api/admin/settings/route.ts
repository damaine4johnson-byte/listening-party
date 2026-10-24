import { NextRequest, NextResponse } from "next/server";
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
      .from("platform_settings")
      .select("free_tier_ads_enabled, free_tier_ad_title, free_tier_ad_body, free_tier_ad_href, new_room_status")
      .eq("setting_key", "global")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Could not load platform settings." }, { status: 503 });
    if (!data) return NextResponse.json({ error: "Platform settings migration has not been applied." }, { status: 503 });
    return NextResponse.json({ settings: data }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Platform settings are not configured." }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  if (!isAdmin(request)) return NextResponse.json({ error: "Developer admin sign-in required." }, { status: 401 });

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Platform settings are invalid." }, { status: 400 });
  }
  const values = input && typeof input === "object"
    ? input as {
      freeTierAdsEnabled?: unknown;
      freeTierAdTitle?: unknown;
      freeTierAdBody?: unknown;
      freeTierAdHref?: unknown;
      newRoomStatus?: unknown;
    }
    : {};
  const adTitle = typeof values.freeTierAdTitle === "string" ? values.freeTierAdTitle.trim() : "";
  const adBody = typeof values.freeTierAdBody === "string" ? values.freeTierAdBody.trim() : "";
  const adHref = typeof values.freeTierAdHref === "string" ? values.freeTierAdHref.trim() : "";
  let safeHref = false;
  try {
    const parsed = new URL(adHref, request.nextUrl.origin);
    safeHref = parsed.origin === request.nextUrl.origin && parsed.pathname.startsWith("/");
  } catch {}

  if (
    typeof values.freeTierAdsEnabled !== "boolean" ||
    !adTitle || adTitle.length > 100 || adBody.length > 400 ||
    !safeHref || adHref.startsWith("//") || adHref.length > 2048 ||
    (values.newRoomStatus !== "scheduled" && values.newRoomStatus !== "live")
  ) {
    return NextResponse.json({ error: "Check ad copy, internal link, and new-room status." }, { status: 400 });
  }

  try {
    const { error } = await createSupabaseAdmin().from("platform_settings").upsert({
      setting_key: "global",
      free_tier_ads_enabled: values.freeTierAdsEnabled,
      free_tier_ad_title: adTitle,
      free_tier_ad_body: adBody,
      free_tier_ad_href: adHref,
      new_room_status: values.newRoomStatus,
      updated_at: new Date().toISOString(),
    }, { onConflict: "setting_key" });
    if (error) return NextResponse.json({ error: "Could not save platform settings." }, { status: 503 });
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "Platform settings are not configured." }, { status: 503 });
  }
}