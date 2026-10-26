import { NextRequest, NextResponse } from "next/server";
import { audit, authorize, cleanSearch } from "../../../../lib/admin-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

// Paginated, searchable lists: ?section=rooms|payments|listeners&page=1&q=term
export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const params = request.nextUrl.searchParams;
  const section = params.get("section");
  const page = Math.max(1, Math.min(10_000, Number(params.get("page")) || 1));
  const q = cleanSearch(params.get("q"));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const db = createSupabaseAdmin();

  let rows: unknown[] | null = null;
  let total = 0;
  let failed = false;

  if (section === "rooms") {
    let query = db.from("rooms")
      .select("id, slug, title, host_id, status, max_listeners, entry_fee_cents, starts_at, created_at", { count: "exact" })
      .order("created_at", { ascending: false }).range(from, to);
    if (q) query = query.ilike("title", `%${q}%`);
    const r = await query;
    rows = r.data; total = r.count ?? 0; failed = Boolean(r.error);
  } else if (section === "payments") {
    let query = db.from("payment_orders")
      .select("order_id, kind, room_id, host_id, display_name, amount_cents, status, created_at, paid_at", { count: "exact" })
      .order("created_at", { ascending: false }).range(from, to);
    if (q) query = query.ilike("display_name", `%${q}%`);
    const r = await query;
    rows = r.data; total = r.count ?? 0; failed = Boolean(r.error);
  } else if (section === "listeners") {
    let query = db.from("room_visits")
      .select("room_id, member_id, display_name, joined_at", { count: "exact" })
      .order("joined_at", { ascending: false }).range(from, to);
    if (q) query = query.ilike("display_name", `%${q}%`);
    const r = await query;
    failed = Boolean(r.error); total = r.count ?? 0;
    const ids = [...new Set((r.data ?? []).map((v) => v.room_id))];
    const titles = ids.length ? await db.from("rooms").select("id, title").in("id", ids) : { data: [] as { id: string; title: string }[] };
    const byId = new Map((titles.data ?? []).map((t) => [t.id, t.title]));
    rows = (r.data ?? []).map((v) => ({ ...v, room_title: byId.get(v.room_id) ?? null }));
  } else {
    return NextResponse.json({ error: "Unknown section." }, { status: 400 });
  }

  if (failed) return NextResponse.json({ error: "Could not load reports." }, { status: 503 });
  return NextResponse.json({ rows, total, page, pageSize: PAGE_SIZE });
}

// Admins can end or reopen a room (e.g. after a report).
export async function PATCH(request: NextRequest) {
  const auth = await authorize(request, "admin", true);
  if ("response" in auth) return auth.response;
  const b = (await request.json().catch(() => null)) as { roomId?: unknown; status?: unknown } | null;
  if (typeof b?.roomId !== "string" || !/^[0-9a-f-]{36}$/i.test(b.roomId) || !["scheduled", "live", "ended"].includes(String(b.status))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { error } = await createSupabaseAdmin().from("rooms").update({ status: b.status }).eq("id", b.roomId);
  if (error) return NextResponse.json({ error: "Could not update room." }, { status: 503 });
  await audit(auth.admin.username, "room_status", b.roomId, { status: b.status });
  return NextResponse.json({ ok: true });
}
