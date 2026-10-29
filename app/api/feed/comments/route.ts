import { NextRequest, NextResponse } from "next/server";
import { getListenerUser } from "../../../../lib/listener-auth";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const post = request.nextUrl.searchParams.get("post") ?? "";
  if (!UUID.test(post)) return NextResponse.json({ error: "Invalid post." }, { status: 400 });
  const { data, error } = await createSupabaseAdmin().from("feed_comments")
    .select("id, user_id, author_name, body, created_at").eq("post_id", post).order("created_at").limit(200);
  if (error) return NextResponse.json({ comments: [] }, { headers: NO_STORE });
  const me = (await getListenerUser(request))?.id;
  return NextResponse.json({
    comments: data.map(({ user_id, ...c }) => ({ ...c, mine: user_id === me })),
    signedIn: Boolean(me),
  }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const user = await getListenerUser(request);
  if (!user) return NextResponse.json({ error: "Sign in with Google to comment." }, { status: 401 });
  const b = (await request.json().catch(() => null)) as { post?: unknown; body?: unknown } | null;
  const body = typeof b?.body === "string" ? b.body.trim() : "";
  if (typeof b?.post !== "string" || !UUID.test(b.post)) return NextResponse.json({ error: "Invalid post." }, { status: 400 });
  if (!body || body.length > 500) return NextResponse.json({ error: "Comments must be 1-500 characters." }, { status: 400 });

  const db = createSupabaseAdmin();
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db.from("feed_comments").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= 5) return NextResponse.json({ error: "You're commenting too fast. Wait a minute." }, { status: 429 });

  const { data: post } = await db.from("feed_posts").select("id").eq("id", b.post).maybeSingle();
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const { data: profile } = await db.from("listener_profiles").select("display_name").eq("user_id", user.id).maybeSingle();
  const meta = user.user_metadata as { full_name?: unknown; name?: unknown };
  const name = ((profile?.display_name as string) || (typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : "") || (user.email ?? "").split("@")[0] || "Listener").slice(0, 40);

  const { data, error } = await db.from("feed_comments").insert({ post_id: b.post, user_id: user.id, author_name: name, body }).select("id, author_name, body, created_at").single();
  if (error || !data) return NextResponse.json({ error: "Comments are not set up yet. Run supabase/follows_notifications_feed.sql." }, { status: 503 });
  return NextResponse.json({ comment: { ...data, mine: true } }, { headers: NO_STORE });
}

export async function DELETE(request: NextRequest) {
  const user = await getListenerUser(request);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = (await request.json().catch(() => null)) as { id?: unknown } | null;
  if (typeof b?.id !== "string" || !UUID.test(b.id)) return NextResponse.json({ error: "Invalid comment." }, { status: 400 });
  await createSupabaseAdmin().from("feed_comments").delete().eq("id", b.id).eq("user_id", user.id);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
