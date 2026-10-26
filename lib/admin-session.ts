import "server-only";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdmin } from "./supabase-admin";

export const ADMIN_SESSION_COOKIE = "fi-admin-session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 4;

type AdminSource = "env" | "db" | "google-env";
export type AdminRole = "owner" | "admin" | "viewer";
export type AdminSession = { username: string; role: AdminRole };

const RANK: Record<AdminRole, number> = { viewer: 1, admin: 2, owner: 3 };

function signature(payload: string) {
  const secret = process.env.APP_SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Supabase server credentials are not configured.");
  return createHmac("sha256", secret).update(`admin-session:${payload}`).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const left = createHmac("sha256", "cmp").update(a).digest();
  const right = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(left, right);
}

// The env account is the bootstrap owner and always works, even before the admin tables exist.
export function envAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password || password.length < 12) return null;
  return { username, password };
}

export function adminGoogleEmails() {
  return (process.env.ADMIN_GOOGLE_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `s1$${salt.toString("base64url")}$${scryptSync(password, salt, 64).toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [v, salt, hash] = stored.split("$");
  if (v !== "s1" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createAdminSessionToken(username: string, source: AdminSource) {
  const payload = Buffer.from(
    JSON.stringify({ admin: username, src: source, expiresAt: Date.now() + ADMIN_SESSION_MAX_AGE * 1000 }),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function parseToken(token?: string): { username: string; source: AdminSource } | null {
  if (!token) return null;
  try {
    const [payload, sig, extra] = token.split(".");
    if (!payload || !sig || extra) return null;
    const expected = Buffer.from(signature(payload), "base64url");
    const actual = Buffer.from(sig, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const d = JSON.parse(Buffer.from(payload, "base64url").toString()) as { admin?: unknown; src?: unknown; expiresAt?: unknown };
    if (typeof d.admin !== "string" || (d.src !== "env" && d.src !== "db" && d.src !== "google-env") || typeof d.expiresAt !== "number" || d.expiresAt <= Date.now()) return null;
    return { username: d.admin, source: d.src };
  } catch {
    return null;
  }
}

// Role and disabled state are re-checked on every request so changes take effect immediately.
export async function readAdminSession(token?: string): Promise<AdminSession | null> {
  const parsed = parseToken(token);
  if (!parsed) return null;
  if (parsed.source === "env") {
    const env = envAdmin();
    return env && safeEqual(env.username, parsed.username) ? { username: env.username, role: "owner" } : null;
  }
  if (parsed.source === "google-env") {
    return adminGoogleEmails().includes(parsed.username) ? { username: parsed.username, role: "owner" } : null;
  }
  try {
    const { data } = await createSupabaseAdmin()
      .from("admin_users").select("username, role, disabled").eq("username", parsed.username).maybeSingle();
    return data && !data.disabled ? { username: data.username, role: data.role as AdminRole } : null;
  } catch {
    return null;
  }
}

export async function authorize(
  request: NextRequest,
  min: AdminRole = "viewer",
  mutating = false,
): Promise<{ admin: AdminSession } | { response: NextResponse }> {
  if (mutating && request.headers.get("origin") !== request.nextUrl.origin) {
    return { response: NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 }) };
  }
  const admin = await readAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (!admin) return { response: NextResponse.json({ error: "Not authorized." }, { status: 401 }) };
  if (RANK[admin.role] < RANK[min]) return { response: NextResponse.json({ error: "Your role cannot do this." }, { status: 403 }) };
  return { admin };
}

export async function audit(admin: string, action: string, target?: string, details?: Record<string, unknown>) {
  try {
    await createSupabaseAdmin().from("admin_audit_log").insert({ admin_username: admin, action, target: target ?? null, details: details ?? null });
  } catch {
    // Auditing must never break the admin action itself.
  }
}

// Strips characters that have meaning inside PostgREST filter strings.
export function cleanSearch(q: string | null) {
  return (q ?? "").replace(/[^\p{L}\p{N} ._@-]/gu, "").trim().slice(0, 60);
}
