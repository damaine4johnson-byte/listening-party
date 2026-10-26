import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "avatars";
const TTL_MS = 60_000;
const cache = new Map<string, { url: string | null; at: number }>();

export const roomCoverPath = (roomId: string) => `rooms/${roomId}.jpg`;

export function clearRoomCoverCache(roomId: string) {
  cache.delete(roomId);
}

// Covers live at a fixed path in the public bucket; the updated timestamp busts browser caches on replace.
export async function getRoomCoverUrls(supabase: SupabaseClient, roomIds: string[]) {
  const result = new Map<string, string | null>();
  const missing = roomIds.filter((id) => {
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < TTL_MS) {
      result.set(id, hit.url);
      return false;
    }
    return true;
  });
  if (!missing.length) return result;

  const { data } = await supabase.storage.from(BUCKET).list("rooms", { limit: 1000 });
  const versions = new Map<string, string>();
  for (const file of data ?? []) {
    versions.set(file.name.replace(/\.jpg$/, ""), file.updated_at ?? file.created_at ?? "");
  }
  for (const id of missing) {
    const version = versions.get(id);
    const url = version === undefined
      ? null
      : `${supabase.storage.from(BUCKET).getPublicUrl(roomCoverPath(id)).data.publicUrl}?v=${encodeURIComponent(version)}`;
    cache.set(id, { url, at: Date.now() });
    result.set(id, url);
  }
  return result;
}
