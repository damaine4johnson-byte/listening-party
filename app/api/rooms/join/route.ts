import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createRoomSessionToken, ROOM_SESSION_COOKIE, ROOM_SESSION_MAX_AGE } from "../../../../lib/room-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { HOST_SESSION_COOKIE } from "../../../../lib/host-session";
import { readActiveHostSession } from "../../../../lib/host-profile";

function getSupabaseHost() {
  const url = process.env.APP_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) return "missing";
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid";
  }
}

function getSafeErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") return { code: "unknown" };
  const value = error as {
    code?: unknown;
    message?: unknown;
    cause?: { code?: unknown };
  };
  const message = typeof value.message === "string"
    ? value.message
      .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[redacted]")
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted]")
      .slice(0, 180)
    : "unknown";

  return {
    code: typeof value.code === "string" ? value.code : "unknown",
    causeCode: typeof value.cause?.code === "string" ? value.cause.code : undefined,
    message,
  };
}

export async function POST(request: NextRequest) {
  let input: unknown;
  try {
    input = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Enter an invitation code and display name." }, { status: 400 });
  }
  if (!input || typeof input !== "object") {
    return NextResponse.json({ error: "Enter an invitation code and display name." }, { status: 400 });
  }

  const values = input as { code?: unknown; displayName?: unknown; paymentSessionId?: unknown };
  const code = typeof values.code === "string" ? values.code.trim() : "";
  const displayName = typeof values.displayName === "string" ? values.displayName.trim().slice(0, 32) : "";
  const paymentSessionId = typeof values.paymentSessionId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values.paymentSessionId)
    ? values.paymentSessionId
    : "";
  if (!code || code.length > 128 || !displayName) {
    return NextResponse.json({ error: "Enter an invitation code and display name." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const inviteCodeHash = createHash("sha256").update(code).digest("hex");
    const { data: room, error } = await supabase
      .from("rooms")
      .select("id, title, status, host_id, entry_fee_cents")
      .eq("invite_code_hash", inviteCodeHash)
      .maybeSingle();

    if (error) {
      console.error("Room join room lookup failed", {
        ...getSafeErrorDetails(error),
        supabaseHost: getSupabaseHost(),
      });
      return NextResponse.json({ error: "Room service is temporarily unavailable." }, { status: 503 });
    }
    if (!room || room.status === "ended") {
      return NextResponse.json({ error: "That invitation code is invalid or the room has ended." }, { status: 401 });
    }

    let claimedSessionId = "";
    if (room.entry_fee_cents > 0) {
      const hostSession = await readActiveHostSession(request.cookies.get(HOST_SESSION_COOKIE)?.value);
      const isRoomHost = Boolean(hostSession && room.host_id && hostSession.hostId === room.host_id);
      if (!isRoomHost) {
        const paymentRequired = {
          error: "This room requires an entry fee.",
          paymentRequired: true,
          entryFeeCents: room.entry_fee_cents,
          roomTitle: room.title,
        };
        if (!paymentSessionId) return NextResponse.json(paymentRequired, { status: 402 });

        const { data: paidOrder } = await supabase
          .from("payment_orders")
          .select("order_id")
          .eq("order_id", paymentSessionId)
          .eq("kind", "entry")
          .eq("room_id", room.id)
          .eq("status", "paid")
          .maybeSingle();
        if (!paidOrder) {
          return NextResponse.json({ ...paymentRequired, error: "Payment was not completed for this room." }, { status: 402 });
        }

        // The conditional update claims the payment for exactly one listener.
        const { data: claimed, error: claimError } = await supabase
          .from("payment_orders")
          .update({ claimed_at: new Date().toISOString() })
          .eq("order_id", paymentSessionId)
          .is("claimed_at", null)
          .select("order_id");
        if (claimError) return NextResponse.json({ error: "Room service is temporarily unavailable." }, { status: 503 });
        if (!claimed?.length) {
          return NextResponse.json({ error: "This payment has already been used to enter the room." }, { status: 409 });
        }
        claimedSessionId = paymentSessionId;
      }
    }
    const releasePaymentClaim = async () => {
      if (claimedSessionId) {
        await supabase.from("payment_orders").update({ claimed_at: null }).eq("order_id", claimedSessionId);
      }
    };

    const memberId = randomUUID();
    const { data: joined, error: membershipError } = await supabase.rpc("join_room_with_limit", {
      p_room_id: room.id,
      p_member_id: memberId,
      p_display_name: displayName,
    });
    if (membershipError) {
      console.error("Room join membership RPC failed", { code: membershipError.code || "unknown" });
      await releasePaymentClaim();
      return NextResponse.json({ error: "Room capacity service is not configured." }, { status: 503 });
    }
    if (!joined) {
      await releasePaymentClaim();
      return NextResponse.json({ error: "This room has reached its listener limit." }, { status: 409 });
    }

    const { error: stateError } = await supabase
      .from("room_state")
      .upsert(
        { room_id: room.id, status: "paused", position_seconds: 0 },
        { onConflict: "room_id", ignoreDuplicates: true },
      );
    if (stateError) {
      console.error("Room join state initialization failed", { code: stateError.code || "unknown" });
      await supabase.from("room_memberships").delete().eq("room_id", room.id).eq("member_id", memberId);
      await releasePaymentClaim();
      return NextResponse.json({ error: "Room state could not be initialized." }, { status: 503 });
    }

    // Best-effort log for host analytics; a failure here must not block entry.
    await supabase.from("room_visits").insert({ room_id: room.id, member_id: memberId, display_name: displayName });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ROOM_SESSION_COOKIE, createRoomSessionToken(room.id, memberId, displayName), {
      httpOnly: true,
      maxAge: ROOM_SESSION_MAX_AGE,
      path: "/",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch {
    console.error("Room join service setup failed");
    return NextResponse.json({ error: "Room service is not configured." }, { status: 503 });
  }
}