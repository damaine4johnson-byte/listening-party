import { NextRequest, NextResponse } from "next/server";
import { HOST_SESSION_COOKIE } from "../../../../lib/host-session";
import { readActiveHostSession } from "../../../../lib/host-profile";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { FEED_BUCKET, FEED_MEDIA_TYPES, feedMediaUrl, isFeedMediaPath } from "../../../../lib/feed-media";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;
const NO_STORE = { "Cache-Control": "no-store" };
const sameOrigin = (request: NextRequest) => request.headers.get("origin") === request.nextUrl.origin;

async function session(request: NextRequest) {
  return readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
}

export async function GET(request: NextRequest) {
  const s = await session(request);
  if (!s) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });
  const { data, error } = await createSupabaseAdmin().from("feed_posts")
    .select("id, title, body, created_at, media_path, media_type").eq("host_id", s.hostId).order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: "Feed posting is not set up yet. Run supabase/follows_notifications_feed.sql." }, { status: 503 });
  return NextResponse.json({ posts: data.map((p) => ({ ...p, mediaUrl: feedMediaUrl(p.media_path) })) }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const s = await session(request);
  if (!s) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof b?.title === "string" ? b.title.trim() : "";
  const body = typeof b?.body === "string" ? b.body.trim() : "";
  const mediaPath = b?.mediaPath ?? null;
  if (mediaPath !== null && !isFeedMediaPath(mediaPath)) return NextResponse.json({ error: "Invalid attachment." }, { status: 400 });
  if (!title || title.length > 120 || !body || body.length > 1500) return NextResponse.json({ error: "Enter a title (up to 120) and text (up to 1500)." }, { status: 400 });

  const db = createSupabaseAdmin();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db.from("feed_posts").select("id", { count: "exact", head: true }).eq("host_id", s.hostId).gte("created_at", since);
  if ((count ?? 0) >= 10) return NextResponse.json({ error: "You can post up to 10 times a day." }, { status: 429 });

  const { data: profile } = await db.from("host_profiles").select("display_name").eq("host_id", s.hostId).maybeSingle();
  const row: Record<string, unknown> = { kind: "update", title, body, author: (profile?.display_name as string) ?? "", author_type: "artist", host_id: s.hostId };
  if (mediaPath) {
    const ext = (mediaPath as string).split(".").pop();
    row.media_path = mediaPath;
    row.media_type = Object.values(FEED_MEDIA_TYPES).find((t) => t.ext === ext)?.kind ?? null;
  }
  const { data, error } = await db.from("feed_posts").insert(row).select("id").single();
  if (error || !data) return NextResponse.json({ error: "Could not publish. Run supabase/follows_notifications_feed.sql and supabase/feed_posts.sql." }, { status: 503 });
  return NextResponse.json({ ok: true, id: data.id }, { headers: NO_STORE });
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const s = await session(request);
  if (!s) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });
  const b = (await request.json().catch(() => null)) as { id?: unknown } | null;
  if (typeof b?.id !== "string" || !UUID.test(b.id)) return NextResponse.json({ error: "Invalid post." }, { status: 400 });
  const db = createSupabaseAdmin();
  const { data: post } = await db.from("feed_posts").select("media_path").eq("id", b.id).eq("host_id", s.hostId).maybeSingle();
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  await db.from("feed_posts").delete().eq("id", b.id).eq("host_id", s.hostId);
  if (isFeedMediaPath(post.media_path)) await db.storage.from(FEED_BUCKET).remove([post.media_path]);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
