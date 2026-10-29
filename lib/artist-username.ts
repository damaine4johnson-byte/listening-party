import "server-only";
import { createSupabaseAdmin } from "./supabase-admin";

// Artist usernames: unique, human-readable handles shown in search and in
// shareable links like /artist/<username>. Unlike the old hash-prefix handle,
// these are chosen by the artist (or auto-generated at signup) and stored in
// plain text on host_profiles.username.

export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,23}$/;

// Unambiguous alphabet (no 0/O, 1/I/L), same family as invite codes.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function normalizeUsername(input: string) {
  return input.trim().toLowerCase().replace(/[\s.@-]+/g, "");
}

// Generates a unique username from a display name or Google email, e.g.
// "Damaine Johnson" -> "damaine", with a numeric suffix when taken.
export async function generateUniqueUsername(seed: string): Promise<string> {
  const base = normalizeUsername(seed).replace(/[^a-z0-9]/g, "").slice(0, 12) || "artist";
  const supabase = createSupabaseAdmin();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = attempt === 0
      ? base.padEnd(3, "x")
      : `${base.slice(0, 11)}${Math.floor(Math.random() * 10000)}`;
    if (!USERNAME_PATTERN.test(candidate)) continue;
    const { data } = await supabase
      .from("host_profiles")
      .select("username")
      .ilike("username", candidate)
      .limit(1);
    if (!data?.length) return candidate;
  }
  // Deterministic fallback: random suffix, extremely unlikely to collide.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
    const candidate = `${base.slice(0, 10)}${suffix}`.slice(0, 24);
    const { data } = await supabase
      .from("host_profiles")
      .select("username")
      .ilike("username", candidate)
      .limit(1);
    if (!data?.length) return candidate;
  }
  throw new Error("Could not allocate a unique username.");
}

export async function isUsernameAvailable(username: string) {
  if (!USERNAME_PATTERN.test(username)) return false;
  const { data } = await createSupabaseAdmin()
    .from("host_profiles")
    .select("username")
    .ilike("username", username)
    .limit(1);
  return !data?.length;
}
