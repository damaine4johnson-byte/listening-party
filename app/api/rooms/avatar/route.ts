import { NextRequest, NextResponse } from "next/server";
import { readRoomSessionToken, ROOM_SESSION_COOKIE } from "../../../../lib/room-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

const MAX_DATA_URL_LENGTH = 24000;
const JPEG_DATA_URL = /^data:image\/jpeg;base64,(\/9j\/[A-Za-z0-9+/]+={0,2})$/;

// Serves a listener's photo by display name so chat polls stay small and images can be cached.
export async function GET(request: NextRequest) {
  const session = readRoomSessionToken(request.cookies.get(ROOM_SESSION_COOKIE)?.value);
  if (!session) return new NextResponse(null, { status: 401 });
  const name = request.nextUrl.searchParams.get("name")?.slice(0, 32) ?? "";
  if (!name) return new NextResponse(null, { status: 404 });

  try {
    const { data } = await createSupabaseAdmin()
      .from("room_visits")
      .select("avatar_url")
      .eq("room_id", session.roomId)
      .eq("display_name", name)
      .not("avatar_url", "is", null)
      .order("joined_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const match = typeof data?.avatar_url === "string" ? JPEG_DATA_URL.exec(data.avatar_url) : null;
    if (!match) return new NextResponse(null, { status: 404 });
    return new NextResponse(Buffer.from(match[1], "base64"), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=120",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const session = readRoomSessionToken(request.cookies.get(ROOM_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Join the room first." }, { status: 401 });

  const input = await request.json().catch(() => null) as { image?: unknown } | null;
  const image = typeof input?.image === "string" ? input.image : "";
  if (image.length > MAX_DATA_URL_LENGTH || !JPEG_DATA_URL.test(image)) {
    return NextResponse.json({ error: "Choose a smaller photo." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const [membership, visit] = await Promise.all([
      supabase.from("room_memberships").update({ avatar_url: image })
        .eq("room_id", session.roomId).eq("member_id", session.memberId),
      supabase.from("room_visits").upsert(
        { room_id: session.roomId, member_id: session.memberId, display_name: session.displayName, avatar_url: image },
        { onConflict: "room_id,member_id" },
      ),
    ]);
    if (membership.error || visit.error) return NextResponse.json({ error: "Could not save your photo." }, { status: 503 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Photo service is not configured." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const session = readRoomSessionToken(request.cookies.get(ROOM_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Join the room first." }, { status: 401 });
  try {
    const supabase = createSupabaseAdmin();
    await Promise.all([
      supabase.from("room_memberships").update({ avatar_url: null }).eq("room_id", session.roomId).eq("member_id", session.memberId),
      supabase.from("room_visits").update({ avatar_url: null }).eq("room_id", session.roomId).eq("member_id", session.memberId),
    ]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Photo service is not configured." }, { status: 503 });
  }
}
