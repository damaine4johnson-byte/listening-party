import { NextRequest, NextResponse } from "next/server";
import { getListenerUser } from "../../../../lib/listener-auth";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { artistUsernameTaken } from "../../../../lib/artist-username";
import { findUserByUsername, usernameOf } from "../../../../lib/listener-username";

export const dynamic = "force-dynamic";

const USERNAME = /^[a-z0-9._-]{3,24}$/;

export async function GET(request: NextRequest) {
  const user = await getListenerUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to manage your login." }, { status: 401 });
  const hasPassword = Boolean(user.identities?.some((identity) => identity.provider === "email"));
  return NextResponse.json({
    username: usernameOf(user),
    hasPassword,
    suggestion: (user.email ?? "").split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 24),
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
  try {
    if (await artistUsernameTaken(username).catch(() => false)) return NextResponse.json({ error: "That username is taken." }, { status: 409 });
    const owner = await findUserByUsername(username);
    if (owner && owner.id !== user.id) return NextResponse.json({ error: "That username is taken." }, { status: 409 });
    const { error } = await db.auth.admin.updateUserById(user.id, {
      app_metadata: { listener_username: username },
      ...(typeof password === "string" ? { password } : {}),
    });
    if (error) return NextResponse.json({ error: "Could not save your login details." }, { status: 503 });
  } catch {
    return NextResponse.json({ error: "Could not save your login details." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, username });
}
