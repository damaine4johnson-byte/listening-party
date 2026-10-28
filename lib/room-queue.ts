import "server-only";
import { createSupabaseAdmin } from "./supabase-admin";

// Moves a track to sit immediately after the one currently playing.
// The reorder is applied atomically by the reorder_room_tracks Postgres
// function, so a concurrent boost or a mid-flight failure can never leave
// track_order in a duplicated or non-contiguous state.
export async function boostTrack(roomId: string, trackId: string) {
  const supabase = createSupabaseAdmin();
  const [{ data: tracks }, { data: state }] = await Promise.all([
    supabase.from("room_tracks").select("id").eq("room_id", roomId).order("track_order", { ascending: true }),
    supabase.from("room_state").select("track_id").eq("room_id", roomId).maybeSingle(),
  ]);
  const ids = (tracks ?? []).map((track) => track.id as string);
  if (!ids.includes(trackId) || state?.track_id === trackId) return;
  const rest = ids.filter((id) => id !== trackId);
  const currentIndex = state?.track_id ? rest.indexOf(state.track_id as string) : -1;
  rest.splice(currentIndex + 1, 0, trackId);

  const { error } = await supabase.rpc("reorder_room_tracks", {
    p_room_id: roomId,
    p_ordered_ids: rest,
  });
  if (error) throw new Error(`Reorder failed: ${error.message}`);
}
