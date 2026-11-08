const ROOM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function listenerRoomDestination(roomId: unknown): string | null {
  if (typeof roomId !== "string" || !ROOM_ID.test(roomId)) return null;
  return `/?roomId=${encodeURIComponent(roomId)}&resume=1#enter-room`;
}
