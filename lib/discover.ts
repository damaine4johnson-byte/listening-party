import "server-only";
import { createSupabaseAdmin } from "./supabase-admin";
import { listPublicArtists, type PublicArtist } from "./artists-public";

export type DiscoverArtist = PublicArtist & { verified: boolean; live: boolean; liveTitle: string; hasRecentPost: boolean };

export async function verifiedHostIds(): Promise<Set<string>> {
  const { data, error } = await createSupabaseAdmin().from("artist_verified").select("host_id").limit(1000);
  return new Set(error ? [] : (data ?? []).map((r) => r.host_id as string));
}

// Public artists decorated with the badges and activity the social surfaces need.
export async function discoverArtists(): Promise<DiscoverArtist[]> {
  const db = createSupabaseAdmin();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [artists, verified, live, recent] = await Promise.all([
    listPublicArtists().catch(() => [] as PublicArtist[]),
    verifiedHostIds().catch(() => new Set<string>()),
    db.from("rooms").select("host_id, title").eq("status", "live").limit(200),
    db.from("feed_posts").select("host_id").eq("author_type", "artist").gte("created_at", since).limit(500),
  ]);
  const liveByHost = new Map<string, string>();
  for (const room of live.error ? [] : (live.data ?? [])) if (room.host_id) liveByHost.set(room.host_id as string, (room.title as string) ?? "");
  const recentHosts = new Set((recent.error ? [] : (recent.data ?? [])).map((r) => r.host_id as string).filter(Boolean));
  return artists.map((a) => ({
    ...a,
    verified: verified.has(a.hostId),
    live: liveByHost.has(a.hostId),
    liveTitle: liveByHost.get(a.hostId) ?? "",
    hasRecentPost: recentHosts.has(a.hostId),
  }));
}

export type PostSummary = { id: string; title: string; media_path: string | null; media_type: string | null; created_at: string; host_id: string | null };

export async function latestMediaPosts(limit = 12): Promise<PostSummary[]> {
  const { data, error } = await createSupabaseAdmin().from("feed_posts")
    .select("id, title, media_path, media_type, created_at, host_id")
    .not("media_path", "is", null).order("created_at", { ascending: false }).limit(limit);
  return error ? [] : (data as PostSummary[]);
}
