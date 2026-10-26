import { NextRequest, NextResponse } from "next/server";
import { HOST_SESSION_COOKIE } from "../../../../../lib/host-session";
import { readActiveHostSession } from "../../../../../lib/host-profile";
import { createSupabaseAdmin } from "../../../../../lib/supabase-admin";

const MAX_BYTES = 1024 * 1024;

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const session = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  const bytes = new Uint8Array(await request.arrayBuffer());
  const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isJpeg || bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: "Could not use that image. Try a different photo." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    await supabase.storage.createBucket("avatars", { public: true, fileSizeLimit: MAX_BYTES, allowedMimeTypes: ["image/jpeg"] });
    const path = `${session.hostId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("avatars").upload(path, bytes, { contentType: "image/jpeg" });
    if (error) return NextResponse.json({ error: "Could not store the picture." }, { status: 503 });
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch {
    return NextResponse.json({ error: "Image storage is not configured." }, { status: 503 });
  }
}
