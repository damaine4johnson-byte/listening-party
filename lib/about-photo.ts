import "server-only";
import { createSupabaseAdmin } from "./supabase-admin";

export const SITE_BUCKET = "site-assets";
export const ABOUT_PHOTO_PATH = "about/founder";

export async function ensureSiteBucket() {
  const admin = createSupabaseAdmin();
  const { data } = await admin.storage.getBucket(SITE_BUCKET);
  if (!data) await admin.storage.createBucket(SITE_BUCKET, { public: true, fileSizeLimit: 2 * 1024 * 1024, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] });
}

// Returns the public URL (cache-busted by upload time) or null when no photo has been set.
export async function getAboutPhotoUrl(): Promise<string | null> {
  try {
    const admin = createSupabaseAdmin();
    const { data } = await admin.storage.from(SITE_BUCKET).list("about", { search: "founder" });
    const file = data?.find((f) => f.name === "founder");
    if (!file) return null;
    const { data: pub } = admin.storage.from(SITE_BUCKET).getPublicUrl(ABOUT_PHOTO_PATH);
    return `${pub.publicUrl}?v=${encodeURIComponent(file.updated_at ?? file.created_at ?? "")}`;
  } catch {
    return null;
  }
}
