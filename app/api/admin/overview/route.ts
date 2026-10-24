import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, readAdminSession } from "../../../../lib/admin-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export async function GET(request: NextRequest) {
  const session = readAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Developer admin sign-in required." }, { status: 401 });

  try {
    const supabase = createSupabaseAdmin();
    const [artists, rooms, liveRooms, freePlans, tier2Plans, tier3Plans] = await Promise.all([
      supabase.from("host_accounts").select("host_id", { count: "exact", head: true }),
      supabase.from("rooms").select("id", { count: "exact", head: true }),
      supabase.from("rooms").select("id", { count: "exact", head: true }).eq("status", "live"),
      supabase.from("host_profiles").select("host_id", { count: "exact", head: true }).eq("plan_tier", "free"),
      supabase.from("host_profiles").select("host_id", { count: "exact", head: true }).eq("plan_tier", "tier2"),
      supabase.from("host_profiles").select("host_id", { count: "exact", head: true }).eq("plan_tier", "tier3"),
    ]);
    if ([artists, rooms, liveRooms, freePlans, tier2Plans, tier3Plans].some(({ error }) => error)) {
      return NextResponse.json({ error: "Could not load platform overview." }, { status: 503 });
    }

    return NextResponse.json({
      identity: session.identity,
      artists: artists.count ?? 0,
      rooms: rooms.count ?? 0,
      liveRooms: liveRooms.count ?? 0,
      plans: { free: freePlans.count ?? 0, tier2: tier2Plans.count ?? 0, tier3: tier3Plans.count ?? 0 },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Admin data service is not configured." }, { status: 503 });
  }
}