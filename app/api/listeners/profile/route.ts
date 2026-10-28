import { NextRequest, NextResponse } from "next/server";
import { getListenerUser } from "../../../../lib/listener-auth";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

function cleanDisplayName(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 32) : undefined;
}

function cleanBio(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 200) : undefined;
}

function cleanAvatarUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^https:\/\/[^\s]+$/i.test(trimmed) || trimmed.length > 2048) return null;
  return trimmed;
}

async function loadProfile(userId: string) {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("listener_profiles")
    .select("display_name, bio, avatar_url")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { error: "Could not load your profile." as const };
  // First visit: derive the display name from the Google account so the
  // profile is never empty on first load.
  return {
    profile: {
      displayName: data?.display_name || "",
      bio: data?.bio || "",
      avatarUrl: data?.avatar_url || "",
    } as { displayName: string; bio: string; avatarUrl: string },
  };
}

export async function GET(request: NextRequest) {
  const user = await getListenerUser(request);
  if (!user) return NextResponse.json({ error: "Sign in with Google to view your profile." }, { status: 401 });

  try {
    const [result, balanceResult] = await Promise.all([
      loadProfile(user.id),
      createSupabaseAdmin()
        .from("listener_coin_wallets")
        .select("balance_coins")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 503 });
    if (balanceResult.error) {
      console.error("Listener wallet lookup failed", { code: balanceResult.error.code ?? "unknown" });
      return NextResponse.json({ error: "Could not load your coin balance." }, { status: 503 });
    }
    return NextResponse.json({
      profile: result.profile,
      email: user.email ?? "",
      balanceCoins: balanceResult.data?.balance_coins ?? 0,
      coinsPerUsd: 10,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Listener profiles are not configured." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getListenerUser(request);
  if (!user) return NextResponse.json({ error: "Sign in with Google to edit your profile." }, { status: 401 });

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Profile details are invalid." }, { status: 400 });
  }
  const values = input && typeof input === "object"
    ? input as { displayName?: unknown; bio?: unknown; avatarUrl?: unknown }
    : {};

  const displayName = cleanDisplayName(values.displayName);
  const bio = cleanBio(values.bio);
  const avatarUrl = cleanAvatarUrl(values.avatarUrl);
  if (displayName === undefined || bio === undefined || avatarUrl === undefined) {
    return NextResponse.json({ error: "Profile details are invalid." }, { status: 400 });
  }
  if (!displayName) return NextResponse.json({ error: "Enter a display name." }, { status: 400 });
  if (avatarUrl === null) {
    return NextResponse.json({ error: "Avatar must be a secure https:// image URL." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from("listener_profiles")
      .upsert({ user_id: user.id, display_name: displayName, bio, avatar_url: avatarUrl }, { onConflict: "user_id" });
    if (error) {
      console.error("Listener profile save failed", { code: error.code ?? "unknown" });
      return NextResponse.json({ error: "Could not save your profile." }, { status: 503 });
    }
    return NextResponse.json({ profile: { displayName, bio, avatarUrl } });
  } catch {
    return NextResponse.json({ error: "Listener profiles are not configured." }, { status: 503 });
  }
}
