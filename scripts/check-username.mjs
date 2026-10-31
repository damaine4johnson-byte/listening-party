// Diagnostic: where is "kystmusic" claimed?
// Usage: node --env-file=.env.local scripts/check-username.mjs <username>
import { createClient } from "@supabase/supabase-js";

const username = (process.argv[2] ?? "").toLowerCase();
const url = process.env.NEXT_PUBLIC_APP_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.APP_DB_SECRET_KEY ?? process.env.APP_SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey || !username) {
  console.error("Usage: node --env-file=.env.local scripts/check-username.mjs <username>");
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: row, error: tableError } = await db.from("artist_usernames").select("*").eq("username", username).maybeSingle();
console.log("artist_usernames row:", tableError ? `ERROR ${tableError.message}` : row ?? "none");

const { data: oldBlob, error: oldError } = await db.storage.from("artist-usernames").download("usernames.json");
if (!oldError && oldBlob) {
  try {
    const map = JSON.parse(await oldBlob.text());
    const key = Object.keys(map).find((k) => k.toLowerCase() === username);
    console.log("old usernames.json entry:", key ? `${key} -> ${map[key]}` : "none", `(file has ${Object.keys(map).length} names)`);
  } catch { console.log("old usernames.json: unreadable"); }
} else {
  console.log("old usernames.json:", oldError?.message ?? "none");
}

// Listener usernames live in auth app_metadata; scan for a match.
let found = null;
for (let page = 1; page <= 10 && !found; page += 1) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) { console.log("auth scan error:", error.message); break; }
  found = data.users.find((u) => (u.app_metadata?.listener_username ?? "") === username) ?? null;
  if (data.users.length < 1000) break;
}
console.log("listener with that username:", found ? `${found.id} (${found.email ?? "no email"})` : "none");
