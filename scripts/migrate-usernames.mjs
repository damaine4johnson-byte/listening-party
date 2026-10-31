// One-time migration: copy artist usernames from the old usernames.json storage
// bucket into the new artist_usernames table. Safe to run more than once.
// Usage: node --env-file=.env.local scripts/migrate-usernames.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_APP_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.APP_DB_SECRET_KEY ?? process.env.APP_SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY first.");
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: blob, error } = await db.storage.from("artist-usernames").download("usernames.json");
if (error || !blob) {
  console.log("No old usernames.json found — nothing to migrate.");
  process.exit(0);
}
let map;
try { map = JSON.parse(await blob.text()); } catch { console.log("Old file was unreadable."); process.exit(0); }

const rows = Object.entries(map).map(([username, hostId]) => ({ username: String(username).toLowerCase(), host_id: String(hostId) }));
if (!rows.length) { console.log("Old file was empty."); process.exit(0); }

const { error: insertError } = await db.from("artist_usernames").upsert(rows, { onConflict: "username,host_id", ignoreDuplicates: true });
if (insertError) {
  console.error("Migration failed:", insertError.message);
  process.exit(1);
}
console.log(`Migrated ${rows.length} username(s) into artist_usernames.`);
