import "server-only";
import { createSupabaseAdmin } from "./supabase-admin";

export type PlatformSettings = {
  free_tier_ads_enabled: boolean;
  free_tier_ad_title: string;
  free_tier_ad_body: string;
  free_tier_ad_href: string;
  new_room_status: "scheduled" | "live";
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  free_tier_ads_enabled: true,
  free_tier_ad_title: "Host your own first listen",
  free_tier_ad_body: "Create an artist profile and bring your listeners together in a private room.",
  free_tier_ad_href: "/signup",
  new_room_status: "scheduled",
};

export async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const { data, error } = await createSupabaseAdmin()
      .from("platform_settings")
      .select("free_tier_ads_enabled, free_tier_ad_title, free_tier_ad_body, free_tier_ad_href, new_room_status")
      .eq("setting_key", "global")
      .maybeSingle();
    if (error || !data) return DEFAULT_PLATFORM_SETTINGS;
    return { ...DEFAULT_PLATFORM_SETTINGS, ...data };
  } catch {
    return DEFAULT_PLATFORM_SETTINGS;
  }
}