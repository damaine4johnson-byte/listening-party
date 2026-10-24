import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "fi-admin-session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 2;

export type AdminSession = {
  identity: string;
  expiresAt: number;
};

function sign(payload: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Admin session signing is not configured.");
  return createHmac("sha256", secret).update(`developer-admin:${payload}`).digest("base64url");
}

export function createAdminSessionToken(identity: string) {
  const payload = Buffer.from(JSON.stringify({
    identity: identity.trim(),
    expiresAt: Date.now() + ADMIN_SESSION_MAX_AGE * 1000,
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readAdminSession(token?: string): AdminSession | null {
  if (!token) return null;

  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const expected = Buffer.from(sign(payload), "base64url");
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      identity?: unknown;
      expiresAt?: unknown;
    };
    if (
      typeof session.identity !== "string" ||
      typeof session.expiresAt !== "number" ||
      session.expiresAt <= Date.now()
    ) return null;

    return { identity: session.identity, expiresAt: session.expiresAt };
  } catch {
    return null;
  }
}

export function matchesAdminCredential(candidate: string, configured: string) {
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const configuredDigest = createHash("sha256").update(configured).digest();
  return timingSafeEqual(candidateDigest, configuredDigest);
}