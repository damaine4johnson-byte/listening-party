import { NextRequest, NextResponse } from "next/server";
import { audit, authorize } from "../../../../lib/admin-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { FEED_BUCKET, FEED_MEDIA_TYPES, feedMediaUrl, isFeedMediaPath } from "../../../../lib/feed-media";

export const dynamic = "force-dynamic";
const KINDS = new Set(["info", "testimonial", "update"]);

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
  const db = createSupabaseAdmin();
  let result = await db.from("feed_posts").select("id, kind, title, body, author, created_at, media_path, media_type").order("created_at", { ascending: false }).limit(100);
  // Before the media migration runs, the media columns do not exist yet.
  if (result.error) result = await db.from("feed_posts").select("id, kind, title, body, author, created_at").order("created_at", { ascending: false }).limit(100) as typeof result;
  if (result.error) return NextResponse.json({ error: "Could not load feed posts. Run supabase/feed_posts.sql first." }, { status: 503 });
  const posts = (result.data ?? []).map((p) => ({ ...p, mediaUrl: feedMediaUrl((p as { media_path?: string | null }).media_path) }));
  return NextResponse.json({ posts });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request, "admin", true);
  if ("response" in auth) return auth.response;
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = typeof b?.kind === "string" ? b.kind : "";
  const title = typeof b?.title === "string" ? b.title.trim() : "";
  const body = typeof b?.body === "string" ? b.body.trim() : "";
  const author = typeof b?.author === "string" ? b.author.trim() : "";
  const mediaPath = b?.mediaPath ?? null;
  if (mediaPath !== null && !isFeedMediaPath(mediaPath)) return NextResponse.json({ error: "Invalid attachment." }, { status: 400 });
  if (!KINDS.has(kind) || !title || title.length > 120 || !body || body.length > 1500 || author.length > 80) {
    return NextResponse.json({ error: "Enter a type, a title (up to 120) and text (up to 1500)." }, { status: 400 });
  }
  const mediaType = mediaPath ? FEED_MEDIA_TYPES[Object.keys(FEED_MEDIA_TYPES).find((t) => FEED_MEDIA_TYPES[t].ext === mediaPath.split(".").pop())!].kind : null;
  const row: Record<string, unknown> = mediaPath ? { kind, title, body, author, media_path: mediaPath, media_type: mediaType } : { kind, title, body, author };
  const { data, error } = await createSupabaseAdmin()
    .from("feed_posts").insert(row).select("id, kind, title, body, author, created_at").single();
  if (error || !data) {
    return NextResponse.json({ error: mediaPath ? "Could not publish the post. Run supabase/feed_posts.sql to enable photos and videos." : "Could not publish the post." }, { status: 503 });
  }
  await audit(auth.admin.username, "feed_post_create", data.id as string, { kind, title });
  return NextResponse.json({ post: data }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize(request, "admin", true);
  if ("response" in auth) return auth.response;
  const b = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof b?.id === "string" ? b.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Choose a post." }, { status: 400 });
  const db = createSupabaseAdmin();
  const { data: existing } = await db.from("feed_posts").select("media_path").eq("id", id).maybeSingle();
  const { error } = await db.from("feed_posts").delete().eq("id", id);
  if (!error && isFeedMediaPath((existing as { media_path?: string } | null)?.media_path)) {
    await db.storage.from(FEED_BUCKET).remove([(existing as { media_path: string }).media_path]);
  }
  if (error) return NextResponse.json({ error: "Could not delete the post." }, { status: 503 });
  await audit(auth.admin.username, "feed_post_delete", id);
  return NextResponse.json({ deleted: true });
}
