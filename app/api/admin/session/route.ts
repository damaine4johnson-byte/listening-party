import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  createAdminSessionToken,
  readAdminSession,
} from "../../../../lib/admin-session";

function hasSameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const session = readAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  return NextResponse.json({ authenticated: Boolean(session), email: session?.email ?? null });
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const allowedEmails = (process.env.ADMIN_GOOGLE_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!url || !anonKey || allowedEmails.length === 0) {
    return NextResponse.json({ error: "Developer admin access is not configured." }, { status: 503 });
  }

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Google identity could not be verified." }, { status: 400 });
  }
  const accessToken = input && typeof input === "object"
    ? (input as { accessToken?: unknown }).accessToken
    : null;
  if (typeof accessToken !== "string" || accessToken.length > 8192) {
    return NextResponse.json({ error: "Google identity could not be verified." }, { status: 400 });
  }

  try {
    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase.auth.getUser(accessToken);
    const user = data.user;
    const email = user?.email?.trim().toLowerCase();
    if (error || !user || user.app_metadata.provider !== "google" || !email || !user.email_confirmed_at) {
      return NextResponse.json({ error: "Google identity could not be verified." }, { status: 401 });
    }
    if (!allowedEmails.includes(email)) {
      return NextResponse.json({ error: "This account is not on the developer allowlist." }, { status: 403 });
    }

    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(email), {
      httpOnly: true,
      maxAge: ADMIN_SESSION_MAX_AGE,
      path: "/",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Admin sign-in is temporarily unavailable." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}