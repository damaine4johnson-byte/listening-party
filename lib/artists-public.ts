import "server-only";
import { createSupabaseAdmin } from "./supabase-admin";
import { hostForUsername, readUsernames, USERNAME_PATTERN, usernameForHost } from "./artist-username";

// The public handle is a prefix of the internal host id, so the full id is never exposed in URLs.
export const HANDLE_LENGTH = 16;
export const handleOf = (hostId: string) => hostId.slice(0, HANDLE_LENGTH);

export type PublicArtist = { hostId: string; handle: string; name: string; bio: string; avatarUrl: string; linkInBio: string; followers: number };

export async function followerCount(hostId: string) {
  const { count } = await createSupabaseAdmin().from("artist_follows").select("listener_user_id", { count: "exact", head: true }).eq("host_id", hostId);
  return count ?? 0;
}

export async function resolveHostId(handle: unknown): Promise<string | null> {
  // Username handles (preferred, shareable): /artist/<username>
  if (typeof handle === "string" && USERNAME_PATTERN.test(handle.toLowerCase())) {
    const hostId = await hostForUsername(handle).catch(() => null);
    if (hostId) return hostId;
  }
  // Legacy hash-prefix handles keep working for existing shared links.
  if (typeof handle !== "string" || !/^[a-f0-9]{16}$/.test(handle)) return null;
  const { data } = await createSupabaseAdmin().from("host_accounts").select("host_id").like("host_id", `${handle}%`).eq("account_status", "active").limit(1).maybeSingle();
  return (data?.host_id as string | undefined) ?? null;
}

export async function getPublicArtist(handle: string): Promise<PublicArtist | null> {
  const hostId = await resolveHostId(handle);
  if (!hostId) return null;
  const { data, error } = await createSupabaseAdmin().from("host_profiles").select("display_name, bio, avatar_url, link_in_bio").eq("host_id", hostId).maybeSingle();
  if (!data && error?.code !== "42703") return null;
  let row: Record<string, unknown> | null = data as Record<string, unknown> | null;
  if (!row) {
    const fallback = await createSupabaseAdmin().from("host_profiles").select("display_name, bio, avatar_url").eq("host_id", hostId).maybeSingle();
    if (!fallback.data) return null;
    row = fallback.data as Record<string, unknown>;
  }
  const username = await usernameForHost(hostId).catch(() => null);
  return {
    hostId, handle: username || handleOf(hostId),
    name: (row.display_name as string) || "Artist", bio: (row.bio as string) ?? "", avatarUrl: (row.avatar_url as string) ?? "",
    linkInBio: (row.link_in_bio as string) ?? "",
    followers: await followerCount(hostId),
  };
}

export async function listPublicArtists(): Promise<PublicArtist[]> {
  const db = createSupabaseAdmin();
  let profiles: Record<string, unknown>[] | null = null;
  const primary = await db.from("host_profiles").select("host_id, display_name, bio, avatar_url, link_in_bio").neq("display_name", "").limit(300);
  profiles = (primary.error?.code === "42703"
    ? (await db.from("host_profiles").select("host_id, display_name, bio, avatar_url").neq("display_name", "").limit(300)).data
    : primary.data) as Record<string, unknown>[] | null;
  const usernames = await readUsernames().catch(() => ({}) as Record<string, string>);

  if (!profiles?.length) return [];
  const { data: active } = await db.from("host_accounts").select("host_id").in("host_id", profiles.map((p) => p.host_id as string)).eq("account_status", "active");
  const activeIds = new Set((active ?? []).map((a) => a.host_id as string));
  const { data: follows } = await db.from("artist_follows").select("host_id").in("host_id", [...activeIds]).limit(100000);
  const counts = new Map<string, number>();
  for (const f of follows ?? []) counts.set(f.host_id as string, (counts.get(f.host_id as string) ?? 0) + 1);
  return profiles.filter((p) => activeIds.has(p.host_id as string)).map((p) => ({
    hostId: p.host_id as string, handle: usernames[p.host_id as string] || handleOf(p.host_id as string), name: p.display_name as string,
    bio: (p.bio as string) ?? "", avatarUrl: (p.avatar_url as string) ?? "", linkInBio: (p.link_in_bio as string | undefined) ?? "", followers: counts.get(p.host_id as string) ?? 0,
  })).sort((a, b) => b.followers - a.followers || a.name.localeCompare(b.name));
}

// Listener-facing artist search: by username, handle or display name.
export async function searchPublicArtists(query: string, limit = 8): Promise<PublicArtist[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const db = createSupabaseAdmin();
  const [userMatches, nameMatches] = await Promise.all([
    db.from("artist_usernames").select("host_id, username").ilike("username", `%${q}%`).limit(limit),
    db.from("host_profiles").select("host_id, display_name, bio, avatar_url").ilike("display_name", `%${q}%`).neq("display_name", "").limit(limit),
  ]);
  if (userMatches.error && nameMatches.error) return [];
  const ids: string[] = [];
  const push = (id: string) => { if (!ids.includes(id) && ids.length < limit) ids.push(id); };
  for (const row of userMatches.data ?? []) push(row.host_id as string);
  for (const row of nameMatches.data ?? []) push(row.host_id as string);
  if (!ids.length) return [];
  const { data: active } = await db.from("host_accounts").select("host_id").in("host_id", ids).eq("account_status", "active");
  const activeIds = new Set((active ?? []).map((a) => a.host_id as string));
  const artists = await Promise.all(ids.filter((id) => activeIds.has(id)).map((id) => getPublicArtistById(id)));
  return artists.filter((a): a is PublicArtist => Boolean(a));
}

export async function getPublicArtistById(hostId: string): Promise<PublicArtist | null> {
  const { data, error } = await createSupabaseAdmin().from("host_profiles").select("display_name, bio, avatar_url, link_in_bio").eq("host_id", hostId).maybeSingle();
  if (!data) {
    if (error?.code === "42703") {
      const fallback = await createSupabaseAdmin().from("host_profiles").select("display_name, bio, avatar_url").eq("host_id", hostId).maybeSingle();
      if (!fallback.data) return null;
      const u = await usernameForHost(hostId).catch(() => null);
      return {
        hostId, handle: u || handleOf(hostId),
        name: (fallback.data.display_name as string) || "Artist", bio: (fallback.data.bio as string) ?? "", avatarUrl: (fallback.data.avatar_url as string) ?? "", linkInBio: "",
        followers: await followerCount(hostId),
      };
    }
    return null;
  }
  const username = await usernameForHost(hostId).catch(() => null);
  return {
    hostId, handle: username || handleOf(hostId),
    name: (data.display_name as string) || "Artist", bio: (data.bio as string) ?? "", avatarUrl: (data.avatar_url as string) ?? "",
    linkInBio: ((data as Record<string, unknown>).link_in_bio as string) ?? "",
    followers: await followerCount(hostId),
  };
}
