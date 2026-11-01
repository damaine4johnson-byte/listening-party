import { NextRequest, NextResponse } from "next/server";
import { getListenerUser } from "../../../../lib/listener-auth";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get("posts") ?? "").split(",").filter((id) => UUID.test(id)).slice(0, 100);
  const me = (await getListenerUser(request))?.id;
  if (!ids.length) return NextResponse.json({ likes: {}, comments: {}, liked: [], saved: [], signedIn: Boolean(me) }, { headers: NO_STORE });

  const db = createSupabaseAdmin();
  const [likes, comments, mineLikes, mineSaves] = await Promise.all([
    db.from("post_likes").select("post_id").in("post_id", ids).limit(50_000),
    db.from("feed_comments").select("post_id").in("post_id", ids).limit(50_000),
    me ? db.from("post_likes").select("post_id").eq("user_id", me).in("post_id", ids) : Promise.resolve({ data: [] }),
    me ? db.from("post_saves").select("post_id").eq("user_id", me).in("post_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const tally = (rows: { post_id: unknown }[] | null) => {
    const counts: Record<string, number> = {};
    for (const row of rows ?? []) counts[row.post_id as string] = (counts[row.post_id as string] ?? 0) + 1;
    return counts;
  };
  return NextResponse.json({
    likes: tally(likes.data),
    comments: tally(comments.data),
    liked: (mineLikes.data ?? []).map((r) => r.post_id),
    saved: (mineSaves.data ?? []).map((r) => r.post_id),
    signedIn: Boolean(me),
  }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const user = await getListenerUser(request);
  if (!user) return NextResponse.json({ error: "Sign in with Google to like or save posts." }, { status: 401 });
  const b = (await request.json().catch(() => null)) as { post?: unknown; action?: unknown } | null;
  if (typeof b?.post !== "string" || !UUID.test(b.post)) return NextResponse.json({ error: "Invalid post." }, { status: 400 });
  const action = b.action;
  if (action !== "like" && action !== "unlike" && action !== "save" && action !== "unsave") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const db = createSupabaseAdmin();
  const table = action === "like" || action === "unlike" ? "post_likes" : "post_saves";
  if (action === "like" || action === "save") {
    const { data: post } = await db.from("feed_posts").select("id").eq("id", b.post).maybeSingle();
    if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
    const { error } = await db.from(table).upsert({ post_id: b.post, user_id: user.id }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: "Could not save that. Try again." }, { status: 503 });
  } else {
    const { error } = await db.from(table).delete().eq("post_id", b.post).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: "Could not save that. Try again." }, { status: 503 });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
