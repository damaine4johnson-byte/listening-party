import { NextRequest, NextResponse } from "next/server";

const SESSION_TOKEN = /^[A-Za-z0-9._~-]{1,8192}$/;

// Force HTTPS in production. The x-forwarded-proto header is set by the
// edge proxy (Vercel), so requests that arrive over plain HTTP are 308-redirected
// to the https URL. This has no effect in local development.
function forceHttps(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return null;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = request.headers.get("host");
  if (!proto || proto === "https" || !host) return null;
  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.host = host;
  return NextResponse.redirect(url, 308);
}

export function middleware(request: NextRequest) {
  const redirect = forceHttps(request);
  if (redirect) return redirect;

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

// Match everything except Next internals so HTTPS enforcement covers pages,
// not only API routes.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
