import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  adminGoogleEmails,
  audit,
  createAdminSessionToken,
} from "../../../../lib/admin-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });

  const url = process.env.APP_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.APP_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.json({ error: "Google sign-in is not configured." }, { status: 503 });

  const input = (await request.json().catch(() => null)) as { accessToken?: unknown } | null;
  if (typeof input?.accessToken !== "string" || input.accessToken.length > 8192) {
    return NextResponse.json({ error: "Google sign-in could not be verified." }, { status: 400 });
  }

  try {
    const supabase = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await supabase.auth.getUser(input.accessToken);
    const user = data.user;
    const email = user?.email?.trim().toLowerCase();
    if (error || !user || user.app_metadata.provider !== "google" || !email || !user.email_confirmed_at) {
      const reason = error ? "token rejected" : !user ? "no user" : user.app_metadata.provider !== "google" ? "not a google login" : "email not confirmed";
      console.error("admin google verify failed:", reason, error?.message);
      return NextResponse.json({ error: `Google account could not be verified (${reason}).` }, { status: 401 });
    }

    let source: "google-env" | "db" | null = adminGoogleEmails().includes(email) ? "google-env" : null;
    let role = "owner";
    if (!source) {
      const { data: row } = await createSupabaseAdmin().from("admin_users").select("id, role, disabled").eq("username", email).maybeSingle();
      if (row && !row.disabled) {
        source = "db";
        role = row.role;
        await createSupabaseAdmin().from("admin_users").update({ last_login_at: new Date().toISOString() }).eq("id", row.id);
      }
    }
    if (!source) {
      await audit(email, "google_login_denied");
      return NextResponse.json({ error: "This Google account is not an admin." }, { status: 403 });
    }

    await audit(email, "google_login");
    const response = NextResponse.json({ authenticated: true, username: email, role });
    response.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(email, source), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: ADMIN_SESSION_MAX_AGE,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Google sign-in is temporarily unavailable." }, { status: 503 });
  }
}
