import "server-only";
import { createSupabaseAdmin } from "./supabase-admin";
import { FEED_MEDIA_TYPES } from "./feed-media";

// Artist gallery photos live in the existing public "feed-media" bucket, under
// gallery/<hostId>/, reusing the same signed-upload flow as feed posts.
export const GALLERY_BUCKET = "feed-media";
export const GALLERY_MAX = 24;
export const GALLERY_CAPTION_MAX = 200;

export function isGalleryPath(value: unknown, hostId: string): value is string {
  return typeof value === "string" && value.startsWith(`gallery/${hostId}/`) && /^gallery\/.+\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/.test(value);
}

export function galleryPath(hostId: string, contentType: string) {
  const ext = FEED_MEDIA_TYPES[contentType]?.ext ?? "jpg";
  return `gallery/${hostId}/${crypto.randomUUID()}.${ext}`;
}

export function galleryMediaUrl(path: string) {
  return createSupabaseAdmin().storage.from(GALLERY_BUCKET).getPublicUrl(path).data.publicUrl;
}

export type GalleryPhoto = { id: string; media_path: string; caption: string; url: string };

export async function listGallery(hostId: string, limit = GALLERY_MAX): Promise<GalleryPhoto[]> {
  try {
    const { data, error } = await createSupabaseAdmin()
      .from("artist_gallery")
      .select("id, media_path, caption")
      .eq("host_id", hostId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((row) => ({ id: row.id as string, media_path: row.media_path as string, caption: (row.caption as string) ?? "", url: galleryMediaUrl(row.media_path as string) }));
  } catch {
    return [];
  }
}
