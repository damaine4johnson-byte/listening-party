import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import {
  createHostSessionToken,
  HOST_SESSION_COOKIE,
  HOST_SESSION_MAX_AGE,
  hostProfileId,
} from "../../../../lib/host-session";
import { persistHostIdentity } from "../../../../lib/host-profile";

function hasSameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const url = process.env.APP_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.APP_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  const allowedEmails = (process.env.HOST_GOOGLE_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!url || !anonKey) {
    return NextResponse.json({ error: "Google host sign-in is not configured." }, { status: 503 });
  }

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Google sign-in could not be verified." }, { status: 400 });
  }
  const accessToken = input && typeof input === "object"
    ? (input as { accessToken?: unknown }).accessToken
    : null;
  if (typeof accessToken !== "string" || accessToken.length > 8192) {
    return NextResponse.json({ error: "Google sign-in could not be verified." }, { status: 400 });
  }

  try {
    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase.auth.getUser(accessToken);
    const user = data.user;
    const email = user?.email?.trim().toLowerCase();

    if (error || !user || user.app_metadata.provider !== "google" || !email) {
      return NextResponse.json({ error: "Google account could not be verified." }, { status: 401 });
    }
    const hostId = hostProfileId("google", email);
    const { data: existingAccount, error: accountError } = await createSupabaseAdmin()
      .from("host_accounts")
      .select("host_id, account_status")
      .eq("host_id", hostId)
      .maybeSingle();
    if (accountError) {
      return NextResponse.json({ error: "Host accounts are not configured." }, { status: 503 });
    }
    if (!allowedEmails.includes(email) && !existingAccount) {
      return NextResponse.json({ error: "Sign up as an artist before signing in." }, { status: 403 });
    }

    const accountStatus = await persistHostIdentity(hostId, "google", email);
    if (accountStatus !== "active") {
      return NextResponse.json({ error: "This host account is suspended." }, { status: 403 });
    }

    const hostSessionToken = createHostSessionToken(hostId);
    const response = NextResponse.json({
      authenticated: true,
      ...(request.headers.get("x-fi-mobile") === "1" ? { hostSessionToken } : {}),
    });
    response.cookies.set(HOST_SESSION_COOKIE, hostSessionToken, {
      httpOnly: true,
      maxAge: HOST_SESSION_MAX_AGE,
      path: "/",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Google host sign-in is temporarily unavailable." }, { status: 503 });
  }
}