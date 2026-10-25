import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const ROOM_SESSION_COOKIE = "fi-room-session";
export const ROOM_SESSION_MAX_AGE = 60 * 60 * 4;

export type RoomSession = {
  roomId: string;
  memberId: string;
  displayName: string;
  expiresAt: number;
};

function sign(value: string) {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Supabase server credentials are not configured.");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createRoomSessionToken(roomId: string, memberId: string, displayName: string) {
  const payload = Buffer.from(
    JSON.stringify({
      roomId,
      memberId,
      displayName,
      expiresAt: Date.now() + ROOM_SESSION_MAX_AGE * 1000,
    }),
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function readRoomSessionToken(token?: string): RoomSession | null {
  if (!token) return null;

  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;

    const expected = Buffer.from(sign(payload), "base64url");
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return null;
    }

    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as RoomSession;
    if (
      typeof session.roomId !== "string" ||
      typeof session.memberId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(session.memberId) ||
      typeof session.displayName !== "string" ||
      typeof session.expiresAt !== "number" ||
      session.expiresAt <= Date.now()
    ) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}