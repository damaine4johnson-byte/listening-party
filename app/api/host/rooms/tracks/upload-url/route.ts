import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { HOST_SESSION_COOKIE } from "../../../../../../lib/host-session";
import { createSupabaseAdmin } from "../../../../../../lib/supabase-admin";
import { readActiveHostSession } from "../../../../../../lib/host-profile";

const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/x-m4a": "m4a",
  "audio/x-wav": "wav",
};

function hasSameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
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
    return NextResponse.json({ error: "Audio upload details are invalid." }, { status: 400 });
  }
  const values = input && typeof input === "object"
    ? input as { roomId?: unknown; fileName?: unknown; contentType?: unknown; fileSize?: unknown }
    : {};
  const { roomId, fileName, contentType, fileSize } = values;
  if (
    typeof roomId !== "string" || !/^[0-9a-f-]{36}$/i.test(roomId) ||
    typeof fileName !== "string" || fileName.length > 255 ||
    typeof contentType !== "string" || !AUDIO_EXTENSIONS[contentType] ||
    typeof fileSize !== "number" || !Number.isInteger(fileSize) || fileSize < 1 || fileSize > MAX_AUDIO_BYTES
  ) {
    return NextResponse.json({ error: "Choose a supported audio file smaller than 200 MB." }, { status: 400 });
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

    const path = `${session.hostId}/${roomId}/${randomUUID()}.${AUDIO_EXTENSIONS[contentType]}`;
    const { data, error } = await supabase.storage.from("tracks").createSignedUploadUrl(path, { upsert: false });
    if (error || !data) return NextResponse.json({ error: "Could not prepare private audio upload." }, { status: 503 });

    return NextResponse.json({ path: data.path, token: data.token }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Audio upload service is not configured." }, { status: 503 });
  }
}