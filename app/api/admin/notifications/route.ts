import { NextRequest, NextResponse } from "next/server";
import { authorize } from "../../../../lib/admin-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

type Notification = { id: string; type: "artist" | "room" | "payment"; text: string; at: string };

// Recent platform activity (last 7 days) the admin may want to react to.
export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
  const db = createSupabaseAdmin();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

  try {
    const [artists, rooms, payments] = await Promise.all([
      db.from("host_accounts").select("host_id, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(20),
      db.from("rooms").select("id, title, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(20),
      db.from("payment_orders")
        .select("order_id, kind, display_name, amount_cents, paid_at")
        .eq("status", "paid")
        .in("kind", ["entry", "tip"])
        .gte("paid_at", since)
        .order("paid_at", { ascending: false })
        .limit(20),
    ]);
    if (artists.error || rooms.error || payments.error) {
      return NextResponse.json({ error: "Could not load notifications." }, { status: 503 });
    }

    const items: Notification[] = [
      ...(artists.data ?? []).map((a) => ({
        id: `artist-${a.host_id}`, type: "artist" as const, text: "New artist signed up", at: a.created_at as string,
      })),
      ...(rooms.data ?? []).map((r) => ({
        id: `room-${r.id}`, type: "room" as const, text: `New room created: ${r.title}`, at: r.created_at as string,
      })),
      ...(payments.data ?? []).map((p) => ({
        id: `payment-${p.order_id}`,
        type: "payment" as const,
        text: `${p.kind === "tip" ? "Tip" : "Room entry"} of $${((p.amount_cents as number) / 100).toFixed(2)} from ${(p.display_name as string | null) || "a listener"}`,
        at: p.paid_at as string,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);

    return NextResponse.json({ notifications: items });
  } catch {
    return NextResponse.json({ error: "Could not load notifications." }, { status: 503 });
  }
}
