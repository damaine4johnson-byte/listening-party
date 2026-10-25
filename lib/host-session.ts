import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const HOST_SESSION_COOKIE = "fi-host-session";
export const HOST_SESSION_MAX_AGE = 60 * 60 * 8;

export type HostProvider = "password" | "google";

export type HostSession = {
  hostId: string;
  expiresAt: number;
};

function sessionSignature(payload: string) {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Supabase server credentials are not configured.");
  return createHmac("sha256", secret).update(`host-session:${payload}`).digest("base64url");
}

export function hostProfileId(provider: HostProvider, identity: string) {
  return createHash("sha256").update(`${provider}:${identity.trim().toLowerCase()}`).digest("hex");
}

export function createHostSessionToken(hostId: string) {
  const payload = Buffer.from(
    JSON.stringify({ hostId, expiresAt: Date.now() + HOST_SESSION_MAX_AGE * 1000 }),
  ).toString("base64url");
  return `${payload}.${sessionSignature(payload)}`;
}

export function readHostSession(token?: string): HostSession | null {
  if (!token) return null;

  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;

    const expected = Buffer.from(sessionSignature(payload), "base64url");
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      hostId?: unknown;
      expiresAt?: unknown;
    };
    if (
      typeof session.hostId !== "string" ||
      !/^[a-f0-9]{64}$/.test(session.hostId) ||
      typeof session.expiresAt !== "number" ||
      session.expiresAt <= Date.now()
    ) {
      return null;
    }
    return { hostId: session.hostId, expiresAt: session.expiresAt };
  } catch {
    return null;
  }
}

export function isValidHostSession(token?: string) {
  return readHostSession(token) !== null;
}

export function matchesHostCredential(candidate: string, configured: string) {
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const configuredDigest = createHash("sha256").update(configured).digest();
  return timingSafeEqual(candidateDigest, configuredDigest);
}