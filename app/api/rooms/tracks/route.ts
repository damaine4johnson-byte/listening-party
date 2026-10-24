import { NextRequest, NextResponse } from "next/server";
import { readRoomSessionToken, ROOM_SESSION_COOKIE } from "../../../../lib/room-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

const SIGNED_URL_SECONDS = 60 * 60;

export async function GET(request: NextRequest) {
  const session = readRoomSessionToken(request.cookies.get(ROOM_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Join the room before loading tracks." }, { status: 401 });

  try {
    const supabase = createSupabaseAdmin();
    const { data: membership, error: membershipError } = await supabase
      .from("room_memberships")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("room_id", session.roomId)
      .eq("member_id", session.memberId)
      .select("member_id")
      .maybeSingle();
    if (membershipError) return NextResponse.json({ error: "Room capacity service is not configured." }, { status: 503 });
    if (!membership) return NextResponse.json({ error: "Your room session expired. Join again." }, { status: 401 });

    const { data: rows, error } = await supabase
      .from("room_tracks")
      .select("id, title, duration_seconds, track_order, storage_path")
      .eq("room_id", session.roomId)
      .order("track_order", { ascending: true })
      .limit(100);
    if (error) return NextResponse.json({ error: "Could not load room tracks." }, { status: 503 });

    const signedTracks = await Promise.all((rows ?? []).map(async (track) => {
      const { data, error: signedUrlError } = await supabase.storage
        .from("tracks")
        .createSignedUrl(track.storage_path, SIGNED_URL_SECONDS);
      if (signedUrlError || !data) return null;
      return {
        id: track.id,
        title: track.title,
        durationSeconds: track.duration_seconds,
        trackOrder: track.track_order,
        url: data.signedUrl,
      };
    }));

    return NextResponse.json({ tracks: signedTracks.filter(Boolean) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Track service is not configured." }, { status: 503 });
  }
}