import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { HOST_SESSION_COOKIE } from "../../../../../lib/host-session";
import { createSupabaseAdmin } from "../../../../../lib/supabase-admin";
import { readActiveHostSession } from "../../../../../lib/host-profile";

// Issues a fresh invite code for a room the host owns. Only the hash is stored, so the
// previous code stops working and the new one is shown exactly once.
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const session = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Host sign-in required." }, { status: 401 });

  const input = await request.json().catch(() => null) as { roomId?: unknown } | null;
  const roomId = typeof input?.roomId === "string" ? input.roomId : "";
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return NextResponse.json({ error: "Choose a room." }, { status: 400 });

  const inviteCode = randomBytes(24).toString("base64url");
  const inviteCodeHash = createHash("sha256").update(inviteCode).digest("hex");

  try {
    const { data, error } = await createSupabaseAdmin()
      .from("rooms")
      .update({ invite_code_hash: inviteCodeHash })
      .eq("id", roomId)
      .eq("host_id", session.hostId)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Room service is temporarily unavailable." }, { status: 503 });
    if (!data) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    return NextResponse.json({ inviteCode }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Room service is not configured." }, { status: 503 });
  }
}
