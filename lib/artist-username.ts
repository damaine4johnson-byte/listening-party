import "server-only";
import { createSupabaseAdmin } from "./supabase-admin";
import { findUserByUsername } from "./listener-username";

// Artist usernames live in one JSON file (username -> host id) in a private storage bucket,
// so no database migration is needed.
export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,23}$/;

const BUCKET = "artist-usernames";
const FILE = "usernames.json";
type UsernameMap = Record<string, string>;

let cache: { map: UsernameMap; at: number } | null = null;

export function normalizeUsername(input: string) {
  return input.trim().toLowerCase().replace(/[\s.@-]+/g, "");
}

async function ensureBucket() {
  const admin = createSupabaseAdmin();
  const { data } = await admin.storage.getBucket(BUCKET);
  if (!data) await admin.storage.createBucket(BUCKET, { public: false });
}

export async function readUsernames(fresh = false): Promise<UsernameMap> {
  if (!fresh && cache && Date.now() - cache.at < 5_000) return cache.map;
  const { data, error } = await createSupabaseAdmin().storage.from(BUCKET).download(FILE);
  let map: UsernameMap = {};
  if (!error && data) {
    try { map = JSON.parse(await data.text()) as UsernameMap; } catch { map = {}; }
  }
  cache = { map, at: Date.now() };
  return map;
}

async function writeUsernames(map: UsernameMap) {
  await ensureBucket();
  const { error } = await createSupabaseAdmin().storage.from(BUCKET).upload(
    FILE,
    new Blob([JSON.stringify(map)], { type: "application/json" }),
    { upsert: true, contentType: "application/json" },
  );
  if (error) throw error;
  cache = { map, at: Date.now() };
}

export const usernameForHost = (map: UsernameMap, hostId: string) =>
  Object.entries(map).find(([, id]) => id === hostId)?.[0] ?? null;

export async function hostForUsername(username: string) {
  return (await readUsernames())[username.toLowerCase()] ?? null;
}

// One name, one person: also unavailable if a listener already uses it.
export async function claimUsername(hostId: string, username: string): Promise<"ok" | "taken" | "invalid"> {
  if (!USERNAME_PATTERN.test(username)) return "invalid";
  const map = { ...(await readUsernames(true)) };
  if (map[username] && map[username] !== hostId) return "taken";
  if (await findUserByUsername(username).catch(() => null)) return "taken";
  for (const [name, id] of Object.entries(map)) if (id === hostId) delete map[name];
  map[username] = hostId;
  await writeUsernames(map);
  return "ok";
}

export async function artistUsernameTaken(username: string) {
  return Boolean((await readUsernames(true))[username.toLowerCase()]);
}

// Builds a free username from a name or email, e.g. "Damaine Johnson" -> "damaine", with a numeric suffix if taken.
export async function generateUniqueUsername(seed: string): Promise<string> {
  const base = normalizeUsername(seed).replace(/[^a-z0-9]/g, "").slice(0, 12) || "artist";
  const map = await readUsernames(true);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidate = attempt === 0 ? base.padEnd(3, "x") : `${base.slice(0, 11)}${Math.floor(Math.random() * 10000)}`;
    if (USERNAME_PATTERN.test(candidate) && !map[candidate]) return candidate;
  }
  throw new Error("Could not allocate a unique username.");
}
