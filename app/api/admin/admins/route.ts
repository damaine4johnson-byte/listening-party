import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { audit, authorize, envAdmin, hashPassword, safeEqual } from "../../../../lib/admin-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

const ROLES = ["owner", "admin", "viewer"];
const USERNAME = /^([A-Za-z0-9._-]{3,40}|[^\s@]{1,64}@[^\s@]{1,255})$/;

// Admin-account management is owner-only.
export async function GET(request: NextRequest) {
  const auth = await authorize(request, "owner");
  if ("response" in auth) return auth.response;
  const { data, error } = await createSupabaseAdmin()
    .from("admin_users").select("id, username, role, disabled, created_at, last_login_at").order("created_at");
  if (error) return NextResponse.json({ error: "Admin accounts are not set up. Run supabase/admin_accounts.sql." }, { status: 503 });
  return NextResponse.json({ admins: data, bootstrapOwner: envAdmin()?.username ?? null });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request, "owner", true);
  if ("response" in auth) return auth.response;
  const b = (await request.json().catch(() => null)) as { username?: unknown; password?: unknown; role?: unknown } | null;
  if (typeof b?.username !== "string" || !USERNAME.test(b.username)) return NextResponse.json({ error: "Use a 3-40 character username or a Google email." }, { status: 400 });
  // Email usernames are Google-only accounts and get an unguessable password.
  const isEmail = b.username.includes("@");
  const password = isEmail && !b.password ? randomBytes(32).toString("base64url") : b.password;
  if (typeof password !== "string" || password.length < 12 || password.length > 200) return NextResponse.json({ error: "Password must be 12-200 characters." }, { status: 400 });
  if (typeof b.role !== "string" || !ROLES.includes(b.role)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  const env = envAdmin();
  if (env && safeEqual(env.username, b.username)) return NextResponse.json({ error: "That username is reserved." }, { status: 409 });

  const { error } = await createSupabaseAdmin().from("admin_users").insert({
    username: isEmail ? b.username.toLowerCase() : b.username, password_hash: hashPassword(password), role: b.role,
  });
  if (error) return NextResponse.json({ error: error.code === "23505" ? "Username already exists." : "Could not create admin." }, { status: error.code === "23505" ? 409 : 503 });
  await audit(auth.admin.username, "admin_create", b.username, { role: b.role });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const auth = await authorize(request, "owner", true);
  if ("response" in auth) return auth.response;
  const b = (await request.json().catch(() => null)) as { id?: unknown; role?: unknown; disabled?: unknown; password?: unknown } | null;
  if (typeof b?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(b.id)) return NextResponse.json({ error: "Invalid admin." }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (b.role !== undefined) {
    if (typeof b.role !== "string" || !ROLES.includes(b.role)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    update.role = b.role;
  }
  if (b.disabled !== undefined) {
    if (typeof b.disabled !== "boolean") return NextResponse.json({ error: "Invalid flag." }, { status: 400 });
    update.disabled = b.disabled;
  }
  if (b.password !== undefined) {
    if (typeof b.password !== "string" || b.password.length < 12 || b.password.length > 200) return NextResponse.json({ error: "Password must be 12-200 characters." }, { status: 400 });
    update.password_hash = hashPassword(b.password);
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const { data, error } = await createSupabaseAdmin().from("admin_users").update(update).eq("id", b.id).select("username").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Could not update admin." }, { status: 503 });
  await audit(auth.admin.username, "admin_update", data.username, { ...update, password_hash: undefined, passwordReset: b.password !== undefined });
  return NextResponse.json({ ok: true });
}
