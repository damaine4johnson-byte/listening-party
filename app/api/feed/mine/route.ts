import { NextRequest, NextResponse } from "next/server";
import { getListenerUser } from "../../../../lib/listener-auth";
import { handleOf } from "../../../../lib/artists-public";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

// What the signed-in listener follows and has saved, for the Following / Saved feed tabs.
export async function GET(request: NextRequest) {
  const user = await getListenerUser(request);
  const headers = { "Cache-Control": "no-store" };
  if (!user) return NextResponse.json({ signedIn: false, following: [], saved: [] }, { headers });
  const db = createSupabaseAdmin();
  const [follows, saves] = await Promise.all([
    db.from("artist_follows").select("host_id").eq("listener_user_id", user.id).limit(1000),
    db.from("post_saves").select("post_id").eq("user_id", user.id).limit(1000),
  ]);
  return NextResponse.json({
    signedIn: true,
    following: (follows.data ?? []).map((f) => handleOf(f.host_id as string)),
    saved: (saves.data ?? []).map((s) => s.post_id as string),
  }, { headers });
}
