import { NextRequest, NextResponse } from "next/server";
import { HOST_SESSION_COOKIE } from "../../../../../lib/host-session";
import { readActiveHostSession } from "../../../../../lib/host-profile";
import { createSupabaseAdmin } from "../../../../../lib/supabase-admin";
import { ensureFeedBucket, FEED_BUCKET, FEED_MEDIA_MAX_BYTES, FEED_MEDIA_TYPES, newFeedMediaPath } from "../../../../../lib/feed-media";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const s = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
  if (!s) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });
  const b = (await request.json().catch(() => null)) as { type?: unknown; size?: unknown } | null;
  if (typeof b?.type !== "string" || !FEED_MEDIA_TYPES[b.type]) return NextResponse.json({ error: "Use a JPEG, PNG, WebP or GIF photo, or an MP4, WebM or MOV video." }, { status: 400 });
  if (typeof b.size !== "number" || b.size <= 0 || b.size > FEED_MEDIA_MAX_BYTES) return NextResponse.json({ error: "Files must be 50 MB or smaller." }, { status: 400 });
  try {
    await ensureFeedBucket();
    const path = newFeedMediaPath(b.type);
    const { data, error } = await createSupabaseAdmin().storage.from(FEED_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return NextResponse.json({ error: "Could not start the upload." }, { status: 503 });
    return NextResponse.json({ signedUrl: data.signedUrl, path });
  } catch {
    return NextResponse.json({ error: "Could not start the upload." }, { status: 503 });
  }
}
