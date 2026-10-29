import { NextRequest, NextResponse } from "next/server";
import { audit, authorize } from "../../../../../lib/admin-session";
import { createSupabaseAdmin } from "../../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
  const { data, error } = await createSupabaseAdmin().from("feed_comments")
    .select("id, post_id, author_name, body, created_at").order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ comments: [] });
  return NextResponse.json({ comments: data });
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize(request, "admin", true);
  if ("response" in auth) return auth.response;
  const b = (await request.json().catch(() => null)) as { id?: unknown } | null;
  if (typeof b?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(b.id)) return NextResponse.json({ error: "Invalid comment." }, { status: 400 });
  const { error } = await createSupabaseAdmin().from("feed_comments").delete().eq("id", b.id);
  if (error) return NextResponse.json({ error: "Could not delete the comment." }, { status: 503 });
  await audit(auth.admin.username, "feed_comment_delete", b.id);
  return NextResponse.json({ ok: true });
}
