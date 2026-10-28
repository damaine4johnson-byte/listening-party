import { NextRequest, NextResponse } from "next/server";
import { audit, authorize } from "../../../../lib/admin-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";
const KINDS = new Set(["info", "testimonial", "update"]);

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
  const { data, error } = await createSupabaseAdmin()
    .from("feed_posts").select("id, kind, title, body, author, created_at").order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Could not load feed posts. Run supabase/feed_posts.sql first." }, { status: 503 });
  return NextResponse.json({ posts: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request, "admin", true);
  if ("response" in auth) return auth.response;
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = typeof b?.kind === "string" ? b.kind : "";
  const title = typeof b?.title === "string" ? b.title.trim() : "";
  const body = typeof b?.body === "string" ? b.body.trim() : "";
  const author = typeof b?.author === "string" ? b.author.trim() : "";
  if (!KINDS.has(kind) || !title || title.length > 120 || !body || body.length > 1500 || author.length > 80) {
    return NextResponse.json({ error: "Enter a type, a title (up to 120) and text (up to 1500)." }, { status: 400 });
  }
  const { data, error } = await createSupabaseAdmin()
    .from("feed_posts").insert({ kind, title, body, author }).select("id, kind, title, body, author, created_at").single();
  if (error || !data) return NextResponse.json({ error: "Could not publish the post." }, { status: 503 });
  await audit(auth.admin.username, "feed_post_create", data.id as string, { kind, title });
  return NextResponse.json({ post: data }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize(request, "admin", true);
  if ("response" in auth) return auth.response;
  const b = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof b?.id === "string" ? b.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Choose a post." }, { status: 400 });
  const { error } = await createSupabaseAdmin().from("feed_posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Could not delete the post." }, { status: 503 });
  await audit(auth.admin.username, "feed_post_delete", id);
  return NextResponse.json({ deleted: true });
}
