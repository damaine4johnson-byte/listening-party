import nextEnv from "@next/env";
import { spawnSync } from "node:child_process";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const sourceUrl = process.env.LEGACY_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const sourceKey = process.env.LEGACY_SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const targetUrl = process.env.RESTORE_TARGET_SUPABASE_URL;
const targetKey = process.env.RESTORE_TARGET_SERVICE_KEY;

function stop(message) {
  console.error(message);
  process.exit(1);
}

if (!sourceUrl || !sourceKey || !targetUrl || !targetKey) {
  stop("Set the legacy source credentials and RESTORE_TARGET_SUPABASE_URL / RESTORE_TARGET_SERVICE_KEY in ignored .env.local.");
}

const sourceHost = new URL(sourceUrl).hostname;
const targetHost = new URL(targetUrl).hostname;
if (sourceHost !== "tisenszkbwsfnprdtdyz.supabase.co" || targetHost !== "vwmixrquacfnppczzuum.supabase.co") {
  stop("The restore is restricted to the verified legacy and current Supabase projects.");
}

function requestJson(baseUrl, key, path, { method = "GET", body, prefer } = {}) {
  const args = [
    "-sS", "--http1.1", "--retry", "3", "--retry-all-errors", "--retry-delay", "1", "--max-time", "45",
    "-w", "\n__RESTORE_STATUS__%{http_code}",
    "-H", `apikey: ${key}`,
    "-H", `Authorization: Bearer ${key}`,
    "-H", "Accept: application/json",
  ];
  if (body !== undefined) {
    args.push("-X", method, "-H", "Content-Type: application/json");
    if (prefer) args.push("-H", `Prefer: ${prefer}`);
    args.push("--data-binary", "@-");
  }
  args.push(`${baseUrl.replace(/\/$/, "")}/rest/v1/${path}`);

  const result = spawnSync("curl", args, {
    encoding: "utf8",
    input: body === undefined ? undefined : JSON.stringify(body),
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Network request failed for ${path} (${result.error?.code || result.status || "unknown"}).`);
  }

  const statusMatch = result.stdout.match(/\n__RESTORE_STATUS__(\d{3})$/);
  if (!statusMatch) throw new Error(`Invalid response for ${path}.`);
  const status = Number(statusMatch[1]);
  let data = null;
  try { data = JSON.parse(result.stdout.slice(0, statusMatch.index)); } catch { /* empty response */ }
  if (status < 200 || status >= 300) {
    const code = data && typeof data === "object" && "code" in data ? String(data.code) : "unknown";
    throw new Error(`Request failed for ${path} (HTTP ${status}, ${code}).`);
  }
  return data;
}

function readRows(table) {
  const data = requestJson(sourceUrl, sourceKey, `${table}?select=*&limit=10000`);
  if (!Array.isArray(data)) throw new Error(`Invalid source response for ${table}.`);
  return data;
}

function transferTrackObject(storagePath) {
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  const storageUrl = (baseUrl) => `${baseUrl.replace(/\/$/, "")}/storage/v1/object/tracks/${encodedPath}`;
  const headers = (key) => ["-H", `apikey: ${key}`, "-H", `Authorization: Bearer ${key}`];
  const separator = storagePath.lastIndexOf("/");
  const prefix = separator < 0 ? "" : storagePath.slice(0, separator + 1);
  const filename = storagePath.slice(separator + 1);
  const targetList = spawnSync("curl", ["-sS", "--http1.1", "--max-time", "20", "-w", "\n__RESTORE_STATUS__%{http_code}", ...headers(targetKey), "-H", "Content-Type: application/json", "-X", "POST", "--data-binary", JSON.stringify({ prefix, limit: 1000, offset: 0 }), `${targetUrl.replace(/\/$/, "")}/storage/v1/object/list/tracks`], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  const listStatus = targetList.stdout.match(/\n__RESTORE_STATUS__(\d{3})$/)?.[1];
  let targetObjects = null;
  try { targetObjects = JSON.parse(targetList.stdout.slice(0, targetList.stdout.lastIndexOf("\n__RESTORE_STATUS__"))); } catch { /* invalid response */ }
  if (targetList.status !== 0 || listStatus !== "200" || !Array.isArray(targetObjects)) {
    throw new Error("Could not check the target audio object list.");
  }
  if (targetObjects.some((object) => object.name === filename || object.name === storagePath)) return false;

  const head = spawnSync("curl", ["-sS", "--http1.1", "--max-time", "20", "-w", "\n__RESTORE_STATUS__%{http_code}", ...headers(sourceKey), "-I", storageUrl(sourceUrl)], { encoding: "utf8" });
  const headStatusMatch = head.stdout.match(/\n__RESTORE_STATUS__(\d{3})$/);
  if (head.status !== 0 || !headStatusMatch || Number(headStatusMatch[1]) !== 200) {
    throw new Error("Could not read the legacy audio object's metadata.");
  }
  const size = Number(head.stdout.match(/^content-length:\s*(\d+)/im)?.[1]);
  const contentType = head.stdout.match(/^content-type:\s*([^\r\n]+)/im)?.[1] ?? "application/octet-stream";
  if (!Number.isFinite(size) || size > 40 * 1024 * 1024) throw new Error("The legacy audio object exceeds the target bucket limit.");

  const download = spawnSync("curl", ["-sS", "--http1.1", "--retry", "3", "--retry-all-errors", "--retry-delay", "1", "--max-time", "60", "-w", "\n__RESTORE_STATUS__%{http_code}", ...headers(sourceKey), storageUrl(sourceUrl)], { encoding: null, maxBuffer: 45 * 1024 * 1024 });
  const marker = Buffer.from("\n__RESTORE_STATUS__");
  const markerIndex = download.stdout?.lastIndexOf(marker) ?? -1;
  const downloadStatus = markerIndex >= 0 ? Number(download.stdout.subarray(markerIndex + marker.length).toString()) : 0;
  if (download.status !== 0 || downloadStatus !== 200) throw new Error("Could not download the legacy audio object.");
  const audio = download.stdout.subarray(0, markerIndex);
  if (audio.length !== size) throw new Error("The downloaded legacy audio size did not match its metadata.");

  const upload = spawnSync("curl", ["-sS", "--http1.1", "--retry", "3", "--retry-all-errors", "--retry-delay", "1", "--max-time", "60", "-w", "\\n__RESTORE_STATUS__%{http_code}", ...headers(targetKey), "-H", `Content-Type: ${contentType}`, "-H", "x-upsert: true", "-X", "POST", "--data-binary", "@-", storageUrl(targetUrl)], { encoding: "utf8", input: audio, maxBuffer: 1024 * 1024 });
  const uploadStatus = upload.stdout.match(/\n__RESTORE_STATUS__(\d{3})$/)?.[1];
  if (upload.status !== 0 || !uploadStatus || Number(uploadStatus) < 200 || Number(uploadStatus) >= 300) {
    throw new Error(`Could not upload the legacy audio object (HTTP ${uploadStatus || "unknown"}).`);
  }
  return true;
}

function insertOnly(table, rows, conflictKey) {
  let inserted = 0;
  for (const row of rows) {
    const data = requestJson(targetUrl, targetKey, `${table}?on_conflict=${encodeURIComponent(conflictKey)}`, {
      method: "POST",
      body: row,
      prefer: "resolution=ignore-duplicates,return=representation",
    });
    if (!Array.isArray(data)) throw new Error(`Invalid target response for ${table}.`);
    inserted += data.length;
  }
  return inserted;
}

try {
  const accounts = readRows("host_accounts");
  const profiles = readRows("host_profiles");
  const admins = readRows("admin_users");
  const audit = readRows("admin_audit_log");
  const rooms = readRows("rooms");
  const tracks = readRows("room_tracks");
  const roomStates = readRows("room_state");
  const memberships = readRows("room_memberships");
  const paymentOrders = readRows("payment_orders");

  const accountRows = accounts.map((row) => ({
    host_id: row.host_id,
    auth_provider: row.auth_provider,
    account_identity: row.account_identity,
    account_status: row.account_status ?? "active",
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
  const profileRows = profiles.map((row) => ({
    host_id: row.host_id,
    display_name: row.display_name ?? "",
    bio: row.bio ?? "",
    avatar_url: row.avatar_url ?? "",
    contact_email: row.contact_email ?? "",
    link_in_bio: row.link_in_bio ?? "",
    paypal_email: row.paypal_email ?? null,
    plan_tier: row.plan_tier ?? "free",
    subscription_status: row.subscription_status ?? "active",
    updated_at: row.updated_at ?? new Date().toISOString(),
  }));
  const usernameRows = profiles
    .filter((row) => typeof row.username === "string" && /^[a-z][a-z0-9_]{2,23}$/.test(row.username))
    .map((row) => ({ username: row.username, host_id: row.host_id }));
  const adminRows = admins.map((row) => ({
    id: row.id,
    username: row.username,
    password_hash: row.password_hash,
    role: row.role ?? "viewer",
    disabled: Boolean(row.disabled),
    created_at: row.created_at,
    last_login_at: row.last_login_at ?? null,
  }));
  const auditRows = audit.map((row) => ({
    id: row.id,
    admin_username: row.admin_username,
    action: row.action,
    target: row.target ?? null,
    details: row.details ?? null,
    created_at: row.created_at,
  }));
  const roomRows = rooms.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    host_user_id: row.host_user_id ?? null,
    host_id: row.host_id ?? null,
    invite_code_hash: row.invite_code_hash,
    max_listeners: row.max_listeners,
    status: row.status,
    starts_at: row.starts_at ?? null,
    created_at: row.created_at,
    description: row.description ?? "",
    entry_fee_cents: row.entry_fee_cents ?? 0,
  }));
  const trackRows = tracks.map((row) => ({
    id: row.id,
    room_id: row.room_id,
    title: row.title,
    storage_path: row.storage_path,
    duration_seconds: row.duration_seconds ?? null,
    track_order: row.track_order,
    created_at: row.created_at,
  }));
  const roomStateRows = roomStates.map((row) => ({
    room_id: row.room_id,
    track_id: row.track_id ?? null,
    status: row.status,
    position_seconds: row.position_seconds,
    started_at: row.started_at ?? null,
    updated_at: row.updated_at,
  }));
  const membershipRows = memberships.map((row) => ({
    room_id: row.room_id,
    member_id: row.member_id,
    display_name: row.display_name,
    last_seen_at: row.last_seen_at,
    avatar_url: row.avatar_url ?? null,
  }));
  const paymentOrderRows = paymentOrders.map((row) => ({
    order_id: row.order_id,
    kind: row.kind,
    room_id: row.room_id ?? null,
    host_id: row.host_id ?? null,
    track_id: row.track_id ?? null,
    member_id: row.member_id ?? null,
    listener_user_id: null,
    display_name: row.display_name ?? null,
    amount_cents: row.amount_cents,
    coins_purchased: row.coins_purchased,
    coins_spent: row.coins_spent,
    status: row.status,
    wipay_transaction_id: row.wipay_transaction_id ?? null,
    claimed_at: row.claimed_at ?? null,
    created_at: row.created_at,
    paid_at: row.paid_at ?? null,
  }));

  const hostAccountsInserted = insertOnly("host_accounts", accountRows, "host_id");
  const hostProfilesInserted = insertOnly("host_profiles", profileRows, "host_id");
  const usernamesInserted = insertOnly("artist_usernames", usernameRows, "username");
  const audioObjectsTransferred = tracks.reduce((count, row) => count + Number(transferTrackObject(row.storage_path)), 0);
  const roomsInserted = insertOnly("rooms", roomRows, "id");
  const tracksInserted = insertOnly("room_tracks", trackRows, "id");
  const roomStatesInserted = insertOnly("room_state", roomStateRows, "room_id");
  const membershipsInserted = insertOnly("room_memberships", membershipRows, "room_id,member_id");
  const adminsInserted = insertOnly("admin_users", adminRows, "username");
  const auditInserted = insertOnly("admin_audit_log", auditRows, "id");
  console.log(JSON.stringify({ restoredAdminUsers: adminsInserted, restoredAuditEntries: auditInserted }));
  const paymentOrdersInserted = insertOnly("payment_orders", paymentOrderRows, "order_id");

  console.log(JSON.stringify({
    sourceCounts: { hostAccounts: accounts.length, hostProfiles: profiles.length, usernames: usernameRows.length, rooms: rooms.length, tracks: tracks.length, roomStates: roomStates.length, memberships: memberships.length, paymentOrders: paymentOrders.length, adminUsers: admins.length, auditEntries: audit.length },
    insertedCounts: { hostAccounts: hostAccountsInserted, hostProfiles: hostProfilesInserted, usernames: usernamesInserted, rooms: roomsInserted, tracks: tracksInserted, roomStates: roomStatesInserted, memberships: membershipsInserted, paymentOrders: paymentOrdersInserted, adminUsers: adminsInserted, auditEntries: auditInserted, audioObjectsTransferred },
    skippedAsExisting: {
      hostAccounts: accounts.length - hostAccountsInserted,
      hostProfiles: profiles.length - hostProfilesInserted,
      usernames: usernameRows.length - usernamesInserted,
      rooms: rooms.length - roomsInserted,
      tracks: tracks.length - tracksInserted,
      roomStates: roomStates.length - roomStatesInserted,
      memberships: memberships.length - membershipsInserted,
      paymentOrders: paymentOrders.length - paymentOrdersInserted,
      adminUsers: admins.length - adminsInserted,
      auditEntries: audit.length - auditInserted,
    },
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Restore failed.");
  process.exitCode = 1;
}