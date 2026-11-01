import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { HOST_SESSION_COOKIE, HOST_SESSION_MAX_AGE, createHostSessionToken, hostProfileId } from "../../../../lib/host-session";

function hasSameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

function listenerDestination(value: unknown) {
  return value === "/wallet" ? "/wallet" : "/profile";
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Sign-in details are invalid." }, { status: 400 });
  }
  const values = input && typeof input === "object"
    ? input as { accessToken?: unknown; next?: unknown }
    : {};
  if (typeof values.accessToken !== "string" || values.accessToken.length > 8192) {
    return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_APP_SUPABASE_URL ?? process.env.APP_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_APP_SUPABASE_ANON_KEY ?? process.env.APP_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Sign-in is not configured." }, { status: 503 });
  }

  try {
    const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await auth.auth.getUser(values.accessToken);
    const user = data.user;
    const email = user?.email?.trim().toLowerCase();
    if (error || !user || !email || !user.email_confirmed_at) {
      return NextResponse.json({ error: "Use a verified account to sign in." }, { status: 401 });
    }

    const hostId = hostProfileId("google", email);
    const { data: host, error: hostError } = await createSupabaseAdmin()
      .from("host_accounts")
      .select("account_status")
      .eq("host_id", hostId)
      .maybeSingle();
    if (hostError) return NextResponse.json({ error: "Could not resolve your account." }, { status: 503 });
    if (host) {
      if (host.account_status !== "active") {
        return NextResponse.json({ error: "This host account is suspended." }, { status: 403 });
      }
      const destination = values.next === "/host" ? "/host" : "/profile";
      const response = NextResponse.json({ accountType: "host", destination });
      response.cookies.set(HOST_SESSION_COOKIE, createHostSessionToken(hostId), {
        httpOnly: true,
        maxAge: HOST_SESSION_MAX_AGE,
        path: "/",
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
      });
      return response;
    }

    const response = NextResponse.json({
      accountType: "listener",
      destination: listenerDestination(values.next),
    });
    response.cookies.set(HOST_SESSION_COOKIE, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Could not resolve your account." }, { status: 503 });
  }
}