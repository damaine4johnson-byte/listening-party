import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { findUserByUsername } from "../../../../lib/listener-username";

export const dynamic = "force-dynamic";

const FAIL = NextResponse.json({ error: "Wrong username or password." }, { status: 401 });

// Username (or email) + password sign-in for listeners who first signed up with Google.
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => null)) as { identifier?: unknown; password?: unknown } | null;
  const identifier = typeof b?.identifier === "string" ? b.identifier.trim().toLowerCase() : "";
  const password = typeof b?.password === "string" ? b.password : "";
  if (!identifier || identifier.length > 320 || !password || password.length > 200) return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_APP_SUPABASE_URL ?? process.env.APP_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_APP_SUPABASE_ANON_KEY ?? process.env.APP_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.json({ error: "Sign-in is not configured." }, { status: 503 });

  try {
    let email = identifier;
    if (!identifier.includes("@")) {
      const found = await findUserByUsername(identifier);
      if (!found?.email) return FAIL.clone();
      email = found.email;
    }
    const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) return FAIL.clone();
    return NextResponse.json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch {
    return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 503 });
  }
}
