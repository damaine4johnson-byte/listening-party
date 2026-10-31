import { NextRequest, NextResponse } from "next/server";
import { HOST_SESSION_COOKIE } from "../../../../lib/host-session";
import { readActiveHostSession } from "../../../../lib/host-profile";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { GALLERY_BUCKET, GALLERY_CAPTION_MAX, GALLERY_MAX, galleryMediaUrl, galleryPath, isGalleryPath, listGallery } from "../../../../lib/artist-gallery";
import { FEED_MEDIA_TYPES, ensureFeedBucket } from "../../../../lib/feed-media";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;
const NO_STORE = { "Cache-Control": "no-store" };
const sameOrigin = (request: NextRequest) => request.headers.get("origin") === request.nextUrl.origin;

function session(request: NextRequest) {
  return readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
}

export async function GET(request: NextRequest) {
  const s = await session(request);
  if (!s) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });
  return NextResponse.json({ photos: await listGallery(s.hostId) }, { headers: NO_STORE });
}

// Start a signed upload for one gallery photo (device file or saved Instagram image).
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const s = await session(request);
  if (!s) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  const b = (await request.json().catch(() => null)) as { type?: unknown; size?: unknown } | null;
  if (typeof b?.type !== "string" || !FEED_MEDIA_TYPES[b.type] || FEED_MEDIA_TYPES[b.type].kind !== "image") {
    return NextResponse.json({ error: "Gallery photos must be JPEG, PNG, WebP or GIF images." }, { status: 400 });
  }
  if (typeof b.size !== "number" || b.size <= 0 || b.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "Photos must be 50 MB or smaller." }, { status: 400 });
  }

  const db = createSupabaseAdmin();
  const { count } = await db.from("artist_gallery").select("id", { count: "exact", head: true }).eq("host_id", s.hostId);
  if ((count ?? 0) >= GALLERY_MAX) {
    return NextResponse.json({ error: `Your gallery is full (${GALLERY_MAX} photos). Remove one to add another.` }, { status: 429 });
  }

  try {
    await ensureFeedBucket();
    const path = galleryPath(s.hostId, b.type);
    const { data, error } = await db.storage.from(GALLERY_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return NextResponse.json({ error: "Could not start the upload." }, { status: 503 });
    return NextResponse.json({ signedUrl: data.signedUrl, path }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Gallery storage is not configured." }, { status: 503 });
  }
}

// Register an uploaded photo (and its caption) so it appears on the profile.
export async function PUT(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const s = await session(request);
  if (!s) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  const b = (await request.json().catch(() => null)) as { path?: unknown; caption?: unknown } | null;
  if (!isGalleryPath(b?.path, s.hostId)) return NextResponse.json({ error: "Invalid photo." }, { status: 400 });
  const caption = typeof b?.caption === "string" && b ? b.caption.trim().slice(0, GALLERY_CAPTION_MAX) : "";

  const db = createSupabaseAdmin();
  const { data, error } = await db.from("artist_gallery")
    .insert({ host_id: s.hostId, media_path: b.path, caption })
    .select("id, media_path, caption").single();
  if (error || !data) return NextResponse.json({ error: "Could not save the photo. Run supabase/artist_gallery.sql." }, { status: 503 });
  return NextResponse.json({ photo: { id: data.id, media_path: data.media_path, caption: data.caption, url: galleryMediaUrl(data.media_path) } }, { headers: NO_STORE });
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const s = await session(request);
  if (!s) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  const b = (await request.json().catch(() => null)) as { id?: unknown } | null;
  if (typeof b?.id !== "string" || !UUID.test(b.id)) return NextResponse.json({ error: "Invalid photo." }, { status: 400 });

  const db = createSupabaseAdmin();
  const { data: photo } = await db.from("artist_gallery").select("media_path").eq("id", b.id).eq("host_id", s.hostId).maybeSingle();
  if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  await db.from("artist_gallery").delete().eq("id", b.id).eq("host_id", s.hostId);
  if (isGalleryPath(photo.media_path, s.hostId)) await db.storage.from(GALLERY_BUCKET).remove([photo.media_path]);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
