import "server-only";
import { createSupabaseAdmin } from "./supabase-admin";

// Best effort: a notification failure must never block creating or starting a room.
export async function notifyFollowers(hostId: string, room: { id: string; title: string; entry_fee_cents: number }, inviteCode: string, live: boolean) {
  try {
    const db = createSupabaseAdmin();
    const { data: follows } = await db.from("artist_follows").select("listener_user_id").eq("host_id", hostId).limit(50000);
    if (!follows?.length) return;
    const { data: profile } = await db.from("host_profiles").select("display_name").eq("host_id", hostId).maybeSingle();
    const artist = (profile?.display_name as string) || "An artist you follow";
    const paid = room.entry_fee_cents > 0;
    const title = live ? `${artist} is live now` : `${artist} opened a new room`;
    const body = `${room.title} · ${paid ? `Entry $${(room.entry_fee_cents / 100).toFixed(2)}` : "Free entry"} · Code: ${inviteCode}`;
    const link = `/?invite=${encodeURIComponent(inviteCode)}&go=1`;
    const rows = follows.map((f) => ({
      user_id: f.listener_user_id, host_id: hostId, room_id: room.id, kind: live ? "live" : "room",
      title: title.slice(0, 160), body: body.slice(0, 500), room_code: inviteCode, link, paid,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from("listener_notifications").insert(rows.slice(i, i + 500));
      if (error) { console.error("Follower notification insert failed", error.code ?? "unknown"); return; }
    }
  } catch {
    console.error("Follower notification failed");
  }
}
