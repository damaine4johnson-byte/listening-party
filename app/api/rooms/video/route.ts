import { NextRequest, NextResponse } from "next/server";
import { HOST_SESSION_COOKIE } from "../../../../lib/host-session";
import { readActiveHostSession } from "../../../../lib/host-profile";
import { createLivekitToken, isLivekitConfigured } from "../../../../lib/livekit";
import { ROOM_SESSION_COOKIE, readRoomSessionToken } from "../../../../lib/room-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export async function GET(request: NextRequest) {
  const roomSession = readRoomSessionToken(request.cookies.get(ROOM_SESSION_COOKIE)?.value);
  if (!roomSession) return NextResponse.json({ error: "Room session is required." }, { status: 401 });
  if (!isLivekitConfigured()) return NextResponse.json({ configured: false });

  try {
    const hostSession = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
    let isRoomHost = false;
    if (hostSession) {
      const { data: room, error } = await createSupabaseAdmin()
        .from("rooms")
        .select("id")
        .eq("id", roomSession.roomId)
        .eq("host_id", hostSession.hostId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: "Could not verify room host." }, { status: 503 });
      isRoomHost = Boolean(room);
    }

    const { token, url } = createLivekitToken({
      roomName: `room-${roomSession.roomId}`,
      identity: isRoomHost ? `host-${roomSession.roomId}` : roomSession.memberId,
      name: roomSession.displayName,
      canPublish: isRoomHost,
    });
    return NextResponse.json({ configured: true, token, url, canPublish: isRoomHost }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Video service is unavailable." }, { status: 503 });
  }
}
