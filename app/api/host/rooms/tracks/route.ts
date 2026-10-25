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

export async function PATCH(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const session = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Playlist order is invalid." }, { status: 400 });
  }
  const values = input && typeof input === "object"
    ? input as { roomId?: unknown; trackIds?: unknown }
    : {};
  if (
    typeof values.roomId !== "string" || !/^[0-9a-f-]{36}$/i.test(values.roomId) ||
    !Array.isArray(values.trackIds) || values.trackIds.length > 100 ||
    values.trackIds.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) ||
    new Set(values.trackIds).size !== values.trackIds.length
  ) {
    return NextResponse.json({ error: "Playlist order is invalid." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id")
      .eq("id", values.roomId)
      .eq("host_id", session.hostId)
      .maybeSingle();
    if (roomError) return NextResponse.json({ error: "Could not verify room ownership." }, { status: 503 });
    if (!room) return NextResponse.json({ error: "Room not found for this host." }, { status: 404 });

    const { data: currentTracks, error: tracksError } = await supabase
      .from("room_tracks")
      .select("id")
      .eq("room_id", values.roomId);
    if (tracksError) return NextResponse.json({ error: "Could not load playlist order." }, { status: 503 });
    const currentIds = new Set((currentTracks ?? []).map((track) => track.id));
    if (currentIds.size !== values.trackIds.length || values.trackIds.some((id) => !currentIds.has(id))) {
      return NextResponse.json({ error: "Playlist changed. Refresh and try again." }, { status: 409 });
    }

    for (const [trackOrder, id] of values.trackIds.entries()) {
      const { error } = await supabase
        .from("room_tracks")
        .update({ track_order: trackOrder })
        .eq("id", id)
        .eq("room_id", values.roomId);
      if (error) return NextResponse.json({ error: "Could not update playlist order." }, { status: 503 });
    }

    const { data, error } = await supabase
      .from("room_tracks")
      .select("id, title, duration_seconds, track_order")
      .eq("room_id", values.roomId)
      .order("track_order", { ascending: true });
    if (error) return NextResponse.json({ error: "Could not load updated playlist." }, { status: 503 });
    return NextResponse.json({ tracks: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Room track service is not configured." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
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
    ? input as { roomId?: unknown; trackId?: unknown }
    : {};
  if (
    typeof values.roomId !== "string" || !/^[0-9a-f-]{36}$/i.test(values.roomId) ||
    typeof values.trackId !== "string" || !/^[0-9a-f-]{36}$/i.test(values.trackId)
  ) {
    return NextResponse.json({ error: "Track details are invalid." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id")
      .eq("id", values.roomId)
      .eq("host_id", session.hostId)
      .maybeSingle();
    if (roomError) return NextResponse.json({ error: "Could not verify room ownership." }, { status: 503 });
    if (!room) return NextResponse.json({ error: "Room not found for this host." }, { status: 404 });

    const { data: track, error: trackError } = await supabase
      .from("room_tracks")
      .select("id, storage_path")
      .eq("id", values.trackId)
      .eq("room_id", values.roomId)
      .maybeSingle();
    if (trackError) return NextResponse.json({ error: "Could not load track." }, { status: 503 });
    if (!track) return NextResponse.json({ error: "Track not found in this room." }, { status: 404 });

    const { error: deleteTrackError } = await supabase
      .from("room_tracks")
      .delete()
      .eq("id", track.id)
      .eq("room_id", values.roomId);
    if (deleteTrackError) return NextResponse.json({ error: "Could not remove track." }, { status: 503 });
    await supabase.storage.from("tracks").remove([track.storage_path]);

    const { data: remaining, error: remainingError } = await supabase
      .from("room_tracks")
      .select("id")
      .eq("room_id", values.roomId)
      .order("track_order", { ascending: true });
    if (remainingError) return NextResponse.json({ error: "Track removed, but playlist order could not be refreshed." }, { status: 503 });
    for (const [trackOrder, item] of (remaining ?? []).entries()) {
      const { error } = await supabase
        .from("room_tracks")
        .update({ track_order: trackOrder })
        .eq("id", item.id)
        .eq("room_id", values.roomId);
      if (error) return NextResponse.json({ error: "Track removed, but playlist order could not be updated." }, { status: 503 });
    }
    return NextResponse.json({ removed: true });
  } catch {
    return NextResponse.json({ error: "Room track service is not configured." }, { status: 503 });
  }
}