import { NextRequest, NextResponse } from "next/server";
import { HOST_SESSION_COOKIE } from "../../../../lib/host-session";
import { readActiveHostSession } from "../../../../lib/host-profile";
import { ROOM_SESSION_COOKIE, readRoomSessionToken } from "../../../../lib/room-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

function hasSameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const roomSession = readRoomSessionToken(request.cookies.get(ROOM_SESSION_COOKIE)?.value);
  const hostSession = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
  if (!roomSession || !hostSession) {
    return NextResponse.json({ error: "Host and room sessions are required." }, { status: 401 });
  }

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Playback command is invalid." }, { status: 400 });
  }
  const values = input && typeof input === "object"
    ? input as { status?: unknown; trackId?: unknown; positionSeconds?: unknown }
    : {};
  const status = values.status;
  const trackId = values.trackId;
  const positionSeconds = values.positionSeconds;
  if (
    (status !== "playing" && status !== "paused") ||
    (trackId !== null && typeof trackId !== "string") ||
    typeof positionSeconds !== "number" || !Number.isFinite(positionSeconds) || positionSeconds < 0
  ) {
    return NextResponse.json({ error: "Playback command is invalid." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id")
      .eq("id", roomSession.roomId)
      .eq("host_id", hostSession.hostId)
      .maybeSingle();
    if (roomError) return NextResponse.json({ error: "Could not verify room host." }, { status: 503 });
    if (!room) return NextResponse.json({ error: "Only this room's host can control playback." }, { status: 403 });

    if (typeof trackId === "string") {
      const { data: track, error: trackError } = await supabase
        .from("room_tracks")
        .select("id, duration_seconds")
        .eq("id", trackId)
        .eq("room_id", roomSession.roomId)
        .maybeSingle();
      if (trackError) return NextResponse.json({ error: "Could not verify track." }, { status: 503 });
      if (!track) return NextResponse.json({ error: "Track does not belong to this room." }, { status: 404 });
      if (track.duration_seconds && positionSeconds > track.duration_seconds) {
        return NextResponse.json({ error: "Playback position exceeds track duration." }, { status: 400 });
      }
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("room_state")
      .update({
        track_id: trackId,
        status,
        position_seconds: positionSeconds,
        started_at: status === "playing" ? now : null,
        updated_at: now,
      })
      .eq("room_id", roomSession.roomId)
      .select("room_id, track_id, status, position_seconds, started_at, updated_at")
      .single();
    if (error || !data) return NextResponse.json({ error: "Playback state could not be saved." }, { status: 503 });

    return NextResponse.json({ state: data }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Playback service is not configured." }, { status: 503 });
  }
}