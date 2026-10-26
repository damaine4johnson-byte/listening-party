import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  audit,
  createAdminSessionToken,
  envAdmin,
  readAdminSession,
  safeEqual,
  verifyPassword,
} from "../../../../lib/admin-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

const attempts = new Map<string, { count: number; resetAt: number }>();

function throttled(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 8;
}

export async function GET(request: NextRequest) {
  const session = await readAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  return NextResponse.json({ authenticated: Boolean(session), username: session?.username ?? null, role: session?.role ?? null });
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (throttled(ip)) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });

  const input = (await request.json().catch(() => ({}))) as { username?: unknown; password?: unknown };
  const { username, password } = input;
  if (typeof username !== "string" || typeof password !== "string" || username.length > 256 || password.length > 512) {
    return NextResponse.json({ error: "Enter your admin username and password." }, { status: 400 });
  }

  let source: "env" | "db" | null = null;
  let role = "owner";
  const env = envAdmin();
  if (env && safeEqual(username, env.username)) {
    if (safeEqual(password, env.password)) source = "env";
  } else {
    try {
      const db = createSupabaseAdmin();
      const { data } = await db.from("admin_users").select("id, password_hash, role, disabled").eq("username", username).maybeSingle();
      // Always hash once so unknown users cost the same as wrong passwords.
      const ok = verifyPassword(password, data?.password_hash ?? "s1$AAAAAAAAAAAAAAAAAAAAAA$AAAA");
      if (data && ok && !data.disabled) {
        source = "db";
        role = data.role;
        await db.from("admin_users").update({ last_login_at: new Date().toISOString() }).eq("id", data.id);
      }
    } catch {
      return NextResponse.json({ error: "Admin storage is not configured." }, { status: 503 });
    }
  }
  if (!source) {
    await audit(username.slice(0, 40), "login_failed");
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  attempts.delete(ip);
  await audit(username, "login");
  const response = NextResponse.json({ authenticated: true, username, role });
  response.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(username, source), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
