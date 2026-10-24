import { NextRequest, NextResponse } from "next/server";
import { HOST_SESSION_COOKIE } from "../../../../../lib/host-session";
import { createSupabaseAdmin } from "../../../../../lib/supabase-admin";
import { readActiveHostSession } from "../../../../../lib/host-profile";

function hasSameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const session = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  const roomId = new URL(request.url).searchParams.get("roomId");
  if (!roomId || !/^[0-9a-f-]{36}$/i.test(roomId)) {
    return NextResponse.json({ error: "Room ID is invalid." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id")
      .eq("id", roomId)
      .eq("host_id", session.hostId)
      .maybeSingle();
    if (roomError) return NextResponse.json({ error: "Could not verify room ownership." }, { status: 503 });
    if (!room) return NextResponse.json({ error: "Room not found for this host." }, { status: 404 });

    const { data, error } = await supabase
      .from("room_tracks")
      .select("id, title, duration_seconds, track_order")
      .eq("room_id", roomId)
      .order("track_order", { ascending: true })
      .limit(100);
    if (error) return NextResponse.json({ error: "Could not load room tracks." }, { status: 503 });
    return NextResponse.json({ tracks: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Room track service is not configured." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const session = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Track details are invalid." }, { status: 400 });
  }
  const values = input && typeof input === "object"
    ? input as { roomId?: unknown; title?: unknown; path?: unknown; durationSeconds?: unknown }
    : {};
  const { roomId, path, durationSeconds } = values;
  const title = typeof values.title === "string" ? values.title.trim() : "";
  if (
    typeof roomId !== "string" || !/^[0-9a-f-]{36}$/i.test(roomId) ||
    typeof path !== "string" || !path.startsWith(`${session.hostId}/${roomId}/`) ||
    path.split("/").length !== 3 ||
    !title || title.length > 120 ||
    (durationSeconds !== undefined && durationSeconds !== null &&
      (typeof durationSeconds !== "number" || !Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 7200))
  ) {
    return NextResponse.json({ error: "Track details are invalid." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id")
      .eq("id", roomId)
      .eq("host_id", session.hostId)
      .maybeSingle();
    if (roomError) return NextResponse.json({ error: "Could not verify room ownership." }, { status: 503 });
    if (!room) return NextResponse.json({ error: "Room not found for this host." }, { status: 404 });

    const pathParts = path.split("/");
    const fileName = pathParts[pathParts.length - 1];
    const { data: objects, error: objectError } = await supabase.storage
      .from("tracks")
      .list(`${session.hostId}/${roomId}`, { search: fileName, limit: 100 });
    if (objectError) return NextResponse.json({ error: "Could not verify uploaded audio." }, { status: 503 });
    if (!objects?.some((object) => object.name === fileName)) {
      return NextResponse.json({ error: "Uploaded audio was not found." }, { status: 400 });
    }

    const { data: lastTrack, error: orderError } = await supabase
      .from("room_tracks")
      .select("track_order")
      .eq("room_id", roomId)
      .order("track_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (orderError) return NextResponse.json({ error: "Could not order room tracks." }, { status: 503 });

    const { data, error } = await supabase
      .from("room_tracks")
      .insert({
        room_id: roomId,
        title,
        storage_path: path,
        duration_seconds: durationSeconds ?? null,
        track_order: (lastTrack?.track_order ?? -1) + 1,
      })
      .select("id, title, duration_seconds, track_order")
      .single();
    if (error || !data) return NextResponse.json({ error: "Could not add track to room." }, { status: 503 });
    return NextResponse.json({ track: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Room track service is not configured." }, { status: 503 });
  }
}