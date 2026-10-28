import { NextRequest, NextResponse } from "next/server";
import { getListenerUser } from "../../../../lib/listener-auth";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

const USERNAME = /^[a-z0-9._-]{3,24}$/;

export async function GET(request: NextRequest) {
  const user = await getListenerUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to manage your login." }, { status: 401 });
  const { data, error } = await createSupabaseAdmin().from("listener_profiles").select("username").eq("user_id", user.id).maybeSingle();
  const hasPassword = Boolean(user.identities?.some((identity) => identity.provider === "email"));
  return NextResponse.json({
    username: error ? null : (data?.username as string | null) ?? null,
    hasPassword,
    suggestion: (user.email ?? "").split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 24),
    ready: !error,
  }, { headers: { "Cache-Control": "no-store" } });
}

// Saves a username and password so a Google-created listener can sign in without Google.
export async function PUT(request: NextRequest) {
  const user = await getListenerUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to manage your login." }, { status: 401 });
  const b = (await request.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
  const username = typeof b?.username === "string" ? b.username.trim().toLowerCase() : "";
  if (!USERNAME.test(username)) return NextResponse.json({ error: "Username must be 3-24 characters: letters, numbers, dots, dashes or underscores." }, { status: 400 });
  const password = b?.password;
  if (password !== undefined && (typeof password !== "string" || password.length < 8 || password.length > 72)) {
    return NextResponse.json({ error: "Password must be 8-72 characters." }, { status: 400 });
  }

  const db = createSupabaseAdmin();
  const { error } = await db.from("listener_profiles").upsert({ user_id: user.id, username }, { onConflict: "user_id" });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That username is taken." }, { status: 409 });
    return NextResponse.json({ error: "Could not save your username. Run supabase/listener_username.sql." }, { status: 503 });
  }
  if (typeof password === "string") {
    const { error: pwError } = await db.auth.admin.updateUserById(user.id, { password });
    if (pwError) return NextResponse.json({ error: "Could not save your password." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, username });
}
