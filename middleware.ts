import { NextRequest, NextResponse } from "next/server";

const SESSION_TOKEN = /^[A-Za-z0-9._~-]{1,8192}$/;

export function middleware(request: NextRequest) {
  const bearerToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const hostToken = request.headers.get("x-fi-host-session") ?? bearerToken;
  const roomToken = request.headers.get("x-fi-room-session") ?? bearerToken;
  const cookies = request.headers.get("cookie") ?? "";
  const additions: string[] = [];
  if (
    hostToken && SESSION_TOKEN.test(hostToken) &&
    !/(?:^|;\s*)fi-host-session=/.test(cookies)
  ) additions.push(`fi-host-session=${hostToken}`);
  if (
    roomToken && SESSION_TOKEN.test(roomToken) &&
    !/(?:^|;\s*)fi-room-session=/.test(cookies)
  ) additions.push(`fi-room-session=${roomToken}`);
  if (additions.length === 0) return NextResponse.next();

  const headers = new Headers(request.headers);
  headers.set("cookie", [cookies, ...additions].filter(Boolean).join("; "));
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/api/:path*"] };
