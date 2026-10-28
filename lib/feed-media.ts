import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdmin } from "./supabase-admin";

export const FEED_BUCKET = "feed-media";
// 50 MB is the per-file ceiling on Supabase's free plan.
export const FEED_MEDIA_MAX_BYTES = 50 * 1024 * 1024;

export const FEED_MEDIA_TYPES: Record<string, { ext: string; kind: "image" | "video" }> = {
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/png": { ext: "png", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
  "image/gif": { ext: "gif", kind: "image" },
  "video/mp4": { ext: "mp4", kind: "video" },
  "video/webm": { ext: "webm", kind: "video" },
  "video/quicktime": { ext: "mov", kind: "video" },
};

const BUCKET_OPTIONS = { public: true, fileSizeLimit: FEED_MEDIA_MAX_BYTES, allowedMimeTypes: Object.keys(FEED_MEDIA_TYPES) };

export async function ensureFeedBucket() {
  const admin = createSupabaseAdmin();
  const { data } = await admin.storage.getBucket(FEED_BUCKET);
  if (!data) await admin.storage.createBucket(FEED_BUCKET, BUCKET_OPTIONS);
}

export function newFeedMediaPath(contentType: string) {
  return `posts/${randomUUID()}.${FEED_MEDIA_TYPES[contentType].ext}`;
}

// Only paths this module issues are accepted back from the browser.
export function isFeedMediaPath(value: unknown): value is string {
  return typeof value === "string" && /^posts\/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm|mov)$/.test(value);
}

export function feedMediaUrl(path: string | null | undefined) {
  if (!path) return null;
  return createSupabaseAdmin().storage.from(FEED_BUCKET).getPublicUrl(path).data.publicUrl;
}
