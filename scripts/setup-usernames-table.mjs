// Setup: creates the artist_usernames table via the management-free route —
// runs the SQL from supabase/artist_usernames.sql against the project using
// the Postgres REST admin endpoint is not available, so this prints a direct
// psql command instead if DSN is missing.
// Usage: node --env-file=.env.local scripts/setup-usernames-table.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_APP_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.APP_DB_SECRET_KEY ?? process.env.APP_SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) { console.error("Missing Supabase credentials."); process.exit(1); }

const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// Check whether the table already exists by querying it.
const { error: probe } = await db.from("artist_usernames").select("username").limit(1);
if (!probe) {
  console.log("artist_usernames table already exists.");
  process.exit(0);
}
console.log("Table missing:", probe.message);

// Supabase exposes the PostgREST management endpoint only on paid plans,
// so fall back to a per-project SQL execution through the /pg endpoint if present.
const projectRef = new URL(url).hostname.split(".")[0];
const sql = readFileSync(new URL("../supabase/artist_usernames.sql", import.meta.url), "utf8");
const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
  body: JSON.stringify({ query: sql }),
}).catch((cause) => { console.error("Could not reach the SQL endpoint:", cause.message); process.exit(2); });

const result = await response.text().catch(() => "");
console.log(`SQL endpoint status ${response.status}: ${result.slice(0, 400) || "(empty)"}`);
console.log(result.startsWith("[") || response.ok
  ? "If the response above is an empty array or 200, the table was created. Re-run this script to confirm."
  : "If unauthorized, run the SQL manually: supabase/artist_usernames.sql in the Supabase dashboard SQL editor.");
