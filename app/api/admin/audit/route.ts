import { NextRequest, NextResponse } from "next/server";
import { authorize } from "../../../../lib/admin-session";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export async function GET(request: NextRequest) {
  const auth = await authorize(request, "owner");
  if ("response" in auth) return auth.response;
  const page = Math.max(1, Math.min(10_000, Number(request.nextUrl.searchParams.get("page")) || 1));
  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await createSupabaseAdmin()
    .from("admin_audit_log")
    .select("id, admin_username, action, target, details, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (error) return NextResponse.json({ error: "Audit log is not set up. Run supabase/admin_accounts.sql." }, { status: 503 });
  return NextResponse.json({ rows: data, total: count ?? 0, page, pageSize: PAGE_SIZE });
}
