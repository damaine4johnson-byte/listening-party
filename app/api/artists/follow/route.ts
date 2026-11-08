import { NextRequest, NextResponse } from "next/server";
import { getListenerUser } from "../../../../lib/listener-auth";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { followerCount, resolveHostId } from "../../../../lib/artists-public";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const hostId = await resolveHostId(request.nextUrl.searchParams.get("artist"));
  if (!hostId) return NextResponse.json({ error: "Artist not found." }, { status: 404 });
  const user = await getListenerUser(request);
  if (!user && request.headers.has("authorization")) {
    return NextResponse.json({ error: "Please sign in again to check your follow status." }, { status: 401, headers: NO_STORE });
  }
  let following = false;
  if (user) {
    const { data, error } = await createSupabaseAdmin().from("artist_follows").select("host_id").eq("listener_user_id", user.id).eq("host_id", hostId).maybeSingle();
    if (error) {
      console.error("Artist follow lookup failed", { code: error.code });
      return NextResponse.json({ error: "Could not check your follow status. Please try again." }, { status: 503, headers: NO_STORE });
    }
    following = Boolean(data);
  }
  return NextResponse.json({ following, signedIn: Boolean(user), followers: await followerCount(hostId) }, { headers: NO_STORE });
}

async function change(request: NextRequest, follow: boolean) {
  const user = await getListenerUser(request);
  if (!user) return NextResponse.json({ error: "Sign in with Google to follow artists." }, { status: 401 });
  const b = (await request.json().catch(() => null)) as { artist?: unknown } | null;
  const hostId = await resolveHostId(b?.artist);
  if (!hostId) return NextResponse.json({ error: "Artist not found." }, { status: 404 });
  const db = createSupabaseAdmin();
  const { error } = follow
    ? await db.from("artist_follows").upsert({ listener_user_id: user.id, host_id: hostId }, { onConflict: "listener_user_id,host_id", ignoreDuplicates: true })
    : await db.from("artist_follows").delete().eq("listener_user_id", user.id).eq("host_id", hostId);
  if (error) {
    console.error("Artist follow update failed", { code: error.code });
    return NextResponse.json({ error: "Could not update your follow. Please try again later." }, { status: 503, headers: NO_STORE });
  }
  return NextResponse.json({ following: follow, followers: await followerCount(hostId) }, { headers: NO_STORE });
}

export const POST = (request: NextRequest) => change(request, true);
export const DELETE = (request: NextRequest) => change(request, false);
