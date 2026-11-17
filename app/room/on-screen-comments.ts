import type { ChatMessage } from "./room-types";

export type ScreenComment = { id: string; name: string; body: string; seenAt: number };

export const COMMENT_TTL_MS = 9000;
export const COMMENT_FADE_MS = 1200;
export const COMMENT_MAX_VISIBLE = 4;
const BODY_LIMIT = 140;

function shorten(body: string) {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length > BODY_LIMIT ? `${text.slice(0, BODY_LIMIT - 1)}…` : text;
}

// Picks out messages that arrived since the last call. The first call is a baseline: the chat
// history loaded on join is remembered but never put on screen. Arrival time is measured on this
// device, so a wrong server or device clock cannot hide or replay comments.
export function collectFreshComments(messages: readonly ChatMessage[], seen: ReadonlySet<string>, now: number, baseline: boolean) {
  const nextSeen = new Set(seen);
  const fresh: ScreenComment[] = [];
  for (const message of messages) {
    if (nextSeen.has(message.id)) continue;
    nextSeen.add(message.id);
    if (baseline || !message.body.trim()) continue;
    fresh.push({ id: message.id, name: message.display_name, body: shorten(message.body), seenAt: now });
  }
  return { fresh, seen: nextSeen };
}

export function visibleComments(items: readonly ScreenComment[], now: number, ttlMs = COMMENT_TTL_MS, max = COMMENT_MAX_VISIBLE) {
  return items.filter((item) => now - item.seenAt < ttlMs).slice(-max);
}

export function isFading(item: ScreenComment, now: number, ttlMs = COMMENT_TTL_MS, fadeMs = COMMENT_FADE_MS) {
  return now - item.seenAt >= ttlMs - fadeMs;
}
