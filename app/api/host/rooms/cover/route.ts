import { NextRequest, NextResponse } from "next/server";
import { HOST_SESSION_COOKIE } from "../../../../../lib/host-session";
import { readActiveHostSession } from "../../../../../lib/host-profile";
import { createSupabaseAdmin } from "../../../../../lib/supabase-admin";
import { clearRoomCoverCache, getRoomCoverUrls, roomCoverPath } from "../../../../../lib/room-cover";

const MAX_BYTES = 1024 * 1024;

async function authorize(request: NextRequest, roomId: string) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const session = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return NextResponse.json({ error: "Choose a room." }, { status: 400 });
  const supabase = createSupabaseAdmin();
  const { data: room } = await supabase.from("rooms").select("id").eq("id", roomId).eq("host_id", session.hostId).maybeSingle();
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  return supabase;
}

export async function POST(request: NextRequest) {
  try {
    const roomId = request.nextUrl.searchParams.get("roomId") ?? "";
    const supabase = await authorize(request, roomId);
    if (supabase instanceof NextResponse) return supabase;

    const bytes = new Uint8Array(await request.arrayBuffer());
    const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!isJpeg || bytes.length > MAX_BYTES) {
      return NextResponse.json({ error: "Could not use that image. Try a different photo." }, { status: 400 });
    }

    await supabase.storage.createBucket("avatars", { public: true, fileSizeLimit: 1048576, allowedMimeTypes: ["image/jpeg"] });
    const { error } = await supabase.storage.from("avatars").upload(roomCoverPath(roomId), bytes, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (error) return NextResponse.json({ error: "Could not store the picture." }, { status: 503 });
    clearRoomCoverCache(roomId);
    const covers = await getRoomCoverUrls(supabase, [roomId]);
    return NextResponse.json({ coverUrl: covers.get(roomId) ?? null });
  } catch {
    return NextResponse.json({ error: "Image storage is not configured." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const roomId = request.nextUrl.searchParams.get("roomId") ?? "";
    const supabase = await authorize(request, roomId);
    if (supabase instanceof NextResponse) return supabase;
    await supabase.storage.from("avatars").remove([roomCoverPath(roomId)]);
    clearRoomCoverCache(roomId);
    return NextResponse.json({ coverUrl: null });
  } catch {
    return NextResponse.json({ error: "Image storage is not configured." }, { status: 503 });
  }
}
