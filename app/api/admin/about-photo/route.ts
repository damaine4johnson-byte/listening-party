import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { audit, authorize } from "../../../../lib/admin-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { ABOUT_PHOTO_PATH, SITE_BUCKET, ensureSiteBucket, getAboutPhotoUrl } from "../../../../lib/about-photo";

export const dynamic = "force-dynamic";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ url: await getAboutPhotoUrl() });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request, "admin", true);
  if ("response" in auth) return auth.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  if (!TYPES.includes(file.type)) return NextResponse.json({ error: "Use a JPEG, PNG or WebP image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image must be 2 MB or smaller." }, { status: 400 });

  try {
    await ensureSiteBucket();
    const { error } = await createSupabaseAdmin().storage.from(SITE_BUCKET).upload(ABOUT_PHOTO_PATH, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
    if (error) return NextResponse.json({ error: "Could not upload the photo." }, { status: 503 });
  } catch {
    return NextResponse.json({ error: "Could not upload the photo." }, { status: 503 });
  }
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
