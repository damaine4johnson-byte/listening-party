// Runs arbitrary SQL against the Supabase project via the management API,
// using the SUPABASE_ACCESS_TOKEN (a platform token, not the DB secret key).
// Usage: node --env-file=.env.local scripts/run-sql.mjs supabase/artist_usernames.sql
import { readFileSync } from "node:fs";

const accessToken = process.env.SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_PLATFORM_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF ?? "tisenszkbwsfnprdtdyz";
const file = process.argv[2];

if (!accessToken) {
  console.error("Missing SUPABASE_ACCESS_TOKEN. Create one at https://supabase.com/dashboard/account/tokens");
  process.exit(1);
}
if (!file) {
  console.error("Usage: node --env-file=.env.local scripts/run-sql.mjs <sql-file>");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({ query: sql }),
}).catch((cause) => { console.error("Network error:", cause.message); process.exit(2); });

const body = await response.text();
console.log(`HTTP ${response.status}: ${body.slice(0, 500) || "(empty)"}`);
process.exit(response.ok ? 0 : 1);
