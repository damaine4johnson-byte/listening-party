import { NextRequest, NextResponse } from "next/server";
import {
  createHostSessionToken,
  HOST_SESSION_COOKIE,
  HOST_SESSION_MAX_AGE,
  isValidHostSession,
  matchesHostCredential,
  hostProfileId,
} from "../../../../lib/host-session";
import { persistHostIdentity } from "../../../../lib/host-profile";

function hasSameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  return NextResponse.json({ authenticated: isValidHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value) });
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const configuredUsername = process.env.HOST_USERNAME;
  const configuredPassword = process.env.HOST_PASSWORD;
  if (!configuredUsername || !configuredPassword) {
    return NextResponse.json({ error: "Host credentials are not configured." }, { status: 503 });
  }

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Enter your host username and password." }, { status: 400 });
  }
  const credentials = input && typeof input === "object"
    ? input as { username?: unknown; password?: unknown }
    : {};
  const username = credentials.username;
  const password = credentials.password;
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username.length > 256 ||
    password.length > 512 ||
    !matchesHostCredential(username, configuredUsername) ||
    !matchesHostCredential(password, configuredPassword)
  ) {
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  const hostId = hostProfileId("password", configuredUsername);
  try {
    await persistHostIdentity(hostId, "password", configuredUsername);
  } catch {
    return NextResponse.json({ error: "Host profile storage is not configured." }, { status: 503 });
  }

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(HOST_SESSION_COOKIE, createHostSessionToken(hostId), {
    httpOnly: true,
    maxAge: HOST_SESSION_MAX_AGE,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(HOST_SESSION_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}