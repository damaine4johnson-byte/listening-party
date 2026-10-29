import "server-only";
import { createSupabaseAdmin } from "./supabase-admin";
import { hasUsernameColumn, USERNAME_PATTERN } from "./artist-username";

// The public handle is a prefix of the internal host id, so the full id is never exposed in URLs.
export const HANDLE_LENGTH = 16;
export const handleOf = (hostId: string) => hostId.slice(0, HANDLE_LENGTH);

export type PublicArtist = { hostId: string; handle: string; name: string; bio: string; avatarUrl: string; followers: number };

export async function followerCount(hostId: string) {
  const { count } = await createSupabaseAdmin().from("artist_follows").select("listener_user_id", { count: "exact", head: true }).eq("host_id", hostId);
  return count ?? 0;
}

export async function resolveHostId(handle: unknown): Promise<string | null> {
  // Username handles (preferred, shareable): /artist/<username>
  if (typeof handle === "string" && USERNAME_PATTERN.test(handle.toLowerCase()) && await hasUsernameColumn()) {
    const { data } = await createSupabaseAdmin()
      .from("host_profiles")
      .select("host_id")
      .ilike("username", handle.toLowerCase())
      .limit(1)
      .maybeSingle();
    if (data?.host_id) return data.host_id as string;
  }
  // Legacy hash-prefix handles keep working for existing shared links.
  if (typeof handle !== "string" || !/^[a-f0-9]{16}$/.test(handle)) return null;
  const { data } = await createSupabaseAdmin().from("host_accounts").select("host_id").like("host_id", `${handle}%`).eq("account_status", "active").limit(1).maybeSingle();
  return (data?.host_id as string | undefined) ?? null;
}

export async function getPublicArtist(handle: string): Promise<PublicArtist | null> {
  const hostId = await resolveHostId(handle);
  if (!hostId) return null;
  const withUsername = await hasUsernameColumn();
  const { data: raw } = await createSupabaseAdmin().from("host_profiles").select(withUsername ? "display_name, bio, avatar_url, username" : "display_name, bio, avatar_url").eq("host_id", hostId).maybeSingle();
  const data = raw as unknown as { display_name?: string; bio?: string; avatar_url?: string; username?: string | null } | null;
  return {
    hostId, handle: data?.username || handleOf(hostId),
    name: (data?.display_name as string) || "Artist", bio: (data?.bio as string) ?? "", avatarUrl: (data?.avatar_url as string) ?? "",
    followers: await followerCount(hostId),
  };
}

export async function listPublicArtists(): Promise<PublicArtist[]> {
  const db = createSupabaseAdmin();
  const withUsername = await hasUsernameColumn();
  const { data: profilesRaw } = await db.from("host_profiles").select(withUsername ? "host_id, display_name, bio, avatar_url, username" : "host_id, display_name, bio, avatar_url").neq("display_name", "").limit(300);
  const profiles = profilesRaw as unknown as Array<{ host_id: string; display_name: string; bio: string | null; avatar_url: string | null; username?: string | null }> | null;
  if (!profiles?.length) return [];
  const { data: active } = await db.from("host_accounts").select("host_id").in("host_id", profiles.map((p) => p.host_id as string)).eq("account_status", "active");
  const activeIds = new Set((active ?? []).map((a) => a.host_id as string));
  const { data: follows } = await db.from("artist_follows").select("host_id").in("host_id", [...activeIds]).limit(100000);
  const counts = new Map<string, number>();
  for (const f of follows ?? []) counts.set(f.host_id as string, (counts.get(f.host_id as string) ?? 0) + 1);
  return profiles.filter((p) => activeIds.has(p.host_id as string)).map((p) => ({
    hostId: p.host_id as string, handle: (p.username as string) || handleOf(p.host_id as string), name: p.display_name as string,
    bio: (p.bio as string) ?? "", avatarUrl: (p.avatar_url as string) ?? "", followers: counts.get(p.host_id as string) ?? 0,
  })).sort((a, b) => b.followers - a.followers || a.name.localeCompare(b.name));
}
