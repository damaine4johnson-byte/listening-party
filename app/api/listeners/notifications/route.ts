import { NextRequest, NextResponse } from "next/server";
import { getListenerUser } from "../../../../lib/listener-auth";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const user = await getListenerUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to see notifications." }, { status: 401 });
  const { data, error } = await createSupabaseAdmin().from("listener_notifications")
    .select("id, kind, title, body, room_code, link, paid, read_at, created_at")
    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);
  if (error) return NextResponse.json({ notifications: [], unread: 0 }, { headers: NO_STORE });
  return NextResponse.json({ notifications: data, unread: data.filter((n) => !n.read_at).length }, { headers: NO_STORE });
}

// Marks every notification read.
export async function POST(request: NextRequest) {
  const user = await getListenerUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to see notifications." }, { status: 401 });
  await createSupabaseAdmin().from("listener_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
