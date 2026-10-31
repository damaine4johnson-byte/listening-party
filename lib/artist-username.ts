import "server-only";
import { createSupabaseAdmin } from "./supabase-admin";
import { findUserByUsername } from "./listener-username";

// Artist usernames live in a dedicated database table (supabase/artist_usernames.sql):
// the primary key on username and the unique constraint on host_id make uniqueness
// a database guarantee instead of a best-effort JSON file.
export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,23}$/;

export function normalizeUsername(input: string) {
  return input.trim().toLowerCase().replace(/[\s.@-]+/g, "");
}

async function table() {
  return createSupabaseAdmin().from("artist_usernames");
}

export async function usernameForHost(hostId: string): Promise<string | null> {
  const { data, error } = await table().then((t) => t.select("username").eq("host_id", hostId).maybeSingle());
  if (error) return null;
  return (data?.username as string | undefined) ?? null;
}

export async function hostForUsername(username: string): Promise<string | null> {
  const { data, error } = await table().then((t) => t.select("host_id").eq("username", username.toLowerCase()).maybeSingle());
  if (error) return null;
  return (data?.host_id as string | undefined) ?? null;
}

// Map form kept for existing callers that need many lookups at once.
export async function readUsernames(fresh = false): Promise<Record<string, string>> {
  const { data, error } = await table().then((t) => t.select("username, host_id").order("username").limit(fresh ? 100_000 : 5_000));
  if (error || !data) return {};
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.username as string] = row.host_id as string;
  return map;
}

// One name, one person: also unavailable if a listener already uses it —
// unless that listener is the same person (ownerEmail matches), so an artist
// who signed up with the same Google account can keep their name.
export async function claimUsername(
  hostId: string,
  username: string,
  ownerEmail?: string,
): Promise<"ok" | "taken" | "invalid"> {
  if (!USERNAME_PATTERN.test(username)) return "invalid";
  if (await artistUsernameTaken(username)) return "taken";
  const owner = await findUserByUsername(username).catch(() => null);
  if (owner && owner.email?.toLowerCase() !== ownerEmail?.toLowerCase()) return "taken";
  // One artist, one name: drop any previous claim this host held.
  const t = await table();
  await t.delete().eq("host_id", hostId);
  const { error } = await t.insert({ username, host_id: hostId });
  if (error) {
    // Lost a race: someone else claimed the same name between the check and the insert.
    if (error.code === "23505") return "taken";
    throw error;
  }
  return "ok";
}

export async function artistUsernameTaken(username: string) {
  return (await hostForUsername(username)) !== null;
}

// Builds a free username from a name or email, e.g. "Damaine Johnson" -> "damaine", with a numeric suffix if taken.
export async function generateUniqueUsername(seed: string): Promise<string> {
  const base = normalizeUsername(seed).replace(/[^a-z0-9]/g, "").slice(0, 12) || "artist";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidate = attempt === 0 ? base.padEnd(3, "x") : `${base.slice(0, 11)}${Math.floor(Math.random() * 10000)}`;
    if (USERNAME_PATTERN.test(candidate) && !(await artistUsernameTaken(candidate))) return candidate;
  }
  throw new Error("Could not allocate a unique username.");
}
