"use client";

import { useEffect, useRef, useState } from "react";
import { collectFreshComments, isFading, visibleComments } from "./on-screen-comments";
import type { ScreenComment } from "./on-screen-comments";
import type { ChatMessage } from "./room-types";

// Shows the newest listener chat messages over the video stage for a few seconds.
export default function OnScreenComments({ messages, ready, enabled }: { messages: ChatMessage[]; ready: boolean; enabled: boolean }) {
  const seenRef = useRef<Set<string>>(new Set());
  const baselineDone = useRef(false);
  const [items, setItems] = useState<ScreenComment[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!ready) return;
    const arrival = Date.now();
    const result = collectFreshComments(messages, seenRef.current, arrival, !baselineDone.current);
    seenRef.current = result.seen;
    baselineDone.current = true;
    if (result.fresh.length > 0) {
      setNow(arrival);
      setItems((current) => [...current, ...result.fresh].slice(-20));
    }
  }, [messages, ready]);

  useEffect(() => {
    if (items.length === 0) return;
    const timer = window.setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      setItems((current) => {
        const alive = visibleComments(current, tick, undefined, current.length);
        return alive.length === current.length ? current : alive;
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, [items.length]);

  if (!enabled) return null;
  const shown = visibleComments(items, now);
  if (shown.length === 0) return null;

  return (
    <div className="rm-comments" aria-hidden="true">
      {shown.map((item) => (
        <div className={`rm-comment ${isFading(item, now) ? "fading" : ""}`} key={item.id}>
          <strong>{item.name}</strong> {item.body}
        </div>
      ))}
    </div>
  );
}
