import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createRoomSessionToken, ROOM_SESSION_COOKIE, ROOM_SESSION_MAX_AGE } from "../../../../lib/room-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { HOST_SESSION_COOKIE } from "../../../../lib/host-session";
import { readActiveHostSession } from "../../../../lib/host-profile";
import { getListenerUser } from "../../../../lib/listener-auth";
import { normalizeInviteCode } from "../../../../lib/invite-code";

function getSupabaseHost() {
  const url = process.env.NEXT_PUBLIC_APP_SUPABASE_URL ?? process.env.APP_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
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

  const values = input as { code?: unknown; roomId?: unknown; displayName?: unknown; paymentSessionId?: unknown };
  const code = typeof values.code === "string" ? values.code.trim() : "";
  const roomId = typeof values.roomId === "string" ? values.roomId.trim() : "";
  const displayName = typeof values.displayName === "string" ? values.displayName.trim().slice(0, 32) : "";
  const paymentSessionId = typeof values.paymentSessionId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values.paymentSessionId)
    ? values.paymentSessionId
    : "";
  if ((!code && !roomId) || (code && roomId) || code.length > 128 || !displayName || (roomId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomId))) {
    return NextResponse.json({ error: "Enter a valid room invitation and display name." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const roomQuery = supabase
      .from("rooms")
      .select("id, title, status, host_id, entry_fee_cents");
    const { data: room, error } = roomId
      ? await roomQuery.eq("id", roomId).maybeSingle()
      : await roomQuery
        .eq("invite_code_hash", createHash("sha256").update(normalizeInviteCode(code)).digest("hex"))
        .maybeSingle();

    if (error) {
      console.error("Room join room lookup failed", {
        ...getSafeErrorDetails(error),
        supabaseHost: getSupabaseHost(),
      });
      return NextResponse.json({ error: "Room service is temporarily unavailable." }, { status: 503 });
    }
    if (!room || room.status === "ended") {
      return NextResponse.json({ error: roomId ? "That room is no longer available." : "That invitation code is invalid or the room has ended." }, { status: 401 });
    }

    if (roomId) {
      const listener = await getListenerUser(request);
      if (!listener) {
        return NextResponse.json({ error: "Sign in to the listener account that follows this artist." }, { status: 401 });
      }
      if (room.entry_fee_cents > 0) {
        return NextResponse.json({ error: "Only free rooms can be joined without an invitation code." }, { status: 403 });
      }
      const { data: follow, error: followError } = await supabase
        .from("artist_follows")
        .select("host_id")
        .eq("listener_user_id", listener.id)
        .eq("host_id", room.host_id)
        .maybeSingle();
      if (followError) {
        console.error("Room join follower verification failed", getSafeErrorDetails(followError));
        return NextResponse.json({ error: "Could not verify your artist follow." }, { status: 503 });
      }
      if (!follow) {
        return NextResponse.json({ error: "Follow this artist to join their free room without a code." }, { status: 403 });
      }
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
          .select("order_id, listener_user_id, coins_spent")
          .eq("order_id", paymentSessionId)
          .eq("kind", "entry")
          .eq("room_id", room.id)
          .eq("status", "paid")
          .maybeSingle();
        if (!paidOrder) {
          return NextResponse.json({ ...paymentRequired, error: "Payment was not completed for this room." }, { status: 402 });
        }
        if (paidOrder.coins_spent > 0) {
          const listener = await getListenerUser(request);
          if (!listener || paidOrder.listener_user_id !== listener.id) {
            return NextResponse.json({ ...paymentRequired, error: "Sign in to the account that paid with coins." }, { status: 401 });
          }
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
      if (!claimedSessionId) return;
      try {
        const { error } = await supabase.from("payment_orders").update({ claimed_at: null }).eq("order_id", claimedSessionId);
        if (error) throw error;
      } catch (error) {
        console.error("Payment claim release failed", getSafeErrorDetails(error));
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
    const { error: visitError } = await supabase
      .from("room_visits")
      .insert({ room_id: room.id, member_id: memberId, display_name: displayName });
    if (visitError) console.error("Room visit log failed", getSafeErrorDetails(visitError));

    const roomSessionToken = createRoomSessionToken(room.id, memberId, displayName);
    const response = NextResponse.json({
      ok: true,
      ...(request.headers.get("x-fi-mobile") === "1" ? { roomSessionToken } : {}),
    });
    response.cookies.set(ROOM_SESSION_COOKIE, roomSessionToken, {
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