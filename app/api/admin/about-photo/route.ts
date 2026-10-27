import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { audit, authorize } from "../../../../lib/admin-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { ABOUT_PHOTO_MAX_BYTES, ABOUT_PHOTO_PATH, SITE_BUCKET, ensureSiteBucket, getAboutPhotoUrl } from "../../../../lib/about-photo";

export const dynamic = "force-dynamic";

const TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ url: await getAboutPhotoUrl() });
}

// Step 1: validate the file's metadata and hand back a signed URL, so the browser uploads straight to
// storage (Vercel functions cannot accept request bodies this large).
export async function POST(request: NextRequest) {
  const auth = await authorize(request, "admin", true);
  if ("response" in auth) return auth.response;

  const b = (await request.json().catch(() => null)) as { type?: unknown; size?: unknown } | null;
  if (typeof b?.type !== "string" || !TYPES.includes(b.type)) return NextResponse.json({ error: "Use a JPEG, PNG or WebP image." }, { status: 400 });
  if (typeof b.size !== "number" || b.size <= 0 || b.size > ABOUT_PHOTO_MAX_BYTES) return NextResponse.json({ error: "Image must be 10 MB or smaller." }, { status: 400 });

  try {
    await ensureSiteBucket();
    const { data, error } = await createSupabaseAdmin().storage.from(SITE_BUCKET).createSignedUploadUrl(ABOUT_PHOTO_PATH, { upsert: true });
    if (error || !data) return NextResponse.json({ error: "Could not start the upload." }, { status: 503 });
    return NextResponse.json({ bucket: SITE_BUCKET, path: data.path, token: data.token });
  } catch {
    return NextResponse.json({ error: "Could not start the upload." }, { status: 503 });
  }
}

// Step 2: called after the browser upload finishes.
export async function PUT(request: NextRequest) {
  const auth = await authorize(request, "admin", true);
  if ("response" in auth) return auth.response;
  await audit(auth.admin.username, "about_photo_update");
  revalidatePath("/about");
  return NextResponse.json({ url: await getAboutPhotoUrl() });
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize(request, "admin", true);
  if ("response" in auth) return auth.response;
  const { error } = await createSupabaseAdmin().storage.from(SITE_BUCKET).remove([ABOUT_PHOTO_PATH]);
  if (error) return NextResponse.json({ error: "Could not remove the photo." }, { status: 503 });
  await audit(auth.admin.username, "about_photo_remove");
  revalidatePath("/about");
  return NextResponse.json({ url: null });
}
