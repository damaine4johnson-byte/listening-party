import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  createAdminSessionToken,
  matchesAdminCredential,
  readAdminSession,
} from "../../../../lib/admin-session";

function hasSameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

function createSessionResponse(identity: string) {
  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(identity), {
    httpOnly: true,
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export async function GET(request: NextRequest) {
  const session = readAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  return NextResponse.json({ authenticated: Boolean(session), identity: session?.identity ?? null });
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Enter admin credentials or sign in with Google." }, { status: 400 });
  }
  const values = input && typeof input === "object"
    ? input as { accessToken?: unknown; username?: unknown; password?: unknown }
    : {};

  if (typeof values.username === "string" || typeof values.password === "string") {
    const configuredUsername = process.env.ADMIN_USERNAME;
    const configuredPassword = process.env.ADMIN_PASSWORD;
    if (!configuredUsername || !configuredPassword) {
      return NextResponse.json({ error: "Admin username/password sign-in is not configured." }, { status: 503 });
    }
    if (
      typeof values.username !== "string" ||
      typeof values.password !== "string" ||
      values.username.length > 256 ||
      values.password.length > 512 ||
      !matchesAdminCredential(values.username, configuredUsername) ||
      !matchesAdminCredential(values.password, configuredPassword)
    ) {
      return NextResponse.json({ error: "Incorrect admin username or password." }, { status: 401 });
    }
    return createSessionResponse(configuredUsername);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const allowedEmails = (process.env.ADMIN_GOOGLE_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!url || !anonKey || allowedEmails.length === 0) {
    return NextResponse.json({ error: "Developer Google sign-in is not configured." }, { status: 503 });
  }

  const accessToken = values.accessToken;
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
    return createSessionResponse(email);
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