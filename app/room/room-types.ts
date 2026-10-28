export type RoomState = {
  room_id: string;
  track_id: string | null;
  status: "playing" | "paused";
  position_seconds: number;
  started_at: string | null;
  updated_at: string;
};
export type ViewerData = {
  viewers: { name: string; spentCents: number; tipCents: number; tipCount: number; rank: number | null; joinedAt: string }[];
  recentJoins: { name: string; joinedAt: string }[];
  totalTipCents: number;
};
export type ChatMessage = { id: string; display_name: string; body: string; created_at: string };
export type RoomTrack = { id: string; title: string; durationSeconds: number | null; trackOrder: number; url: string };
export type HostProfile = { display_name: string; bio: string; avatar_url: string };
export type Reaction = { id: string; display_name: string; reaction: "heart" | "fire" | "clap" | "laugh" | "wow"; created_at: string };
export type HouseAd = { title: string; body: string; href: string };
export type TipAlert = { id: string; name: string; amountCents: number; song: string | null };

export const REACTIONS = [
  { id: "heart", label: "Love", symbol: "♥" },
  { id: "fire", label: "Fire", symbol: "🔥" },
  { id: "clap", label: "Clap", symbol: "👏" },
  { id: "laugh", label: "Laugh", symbol: "😂" },
  { id: "wow", label: "Wow", symbol: "😮" },
] as const;

export function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

export async function resizeToJpeg(file: File, size = 96): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  const side = Math.min(bitmap.width, bitmap.height);
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.75);
}
