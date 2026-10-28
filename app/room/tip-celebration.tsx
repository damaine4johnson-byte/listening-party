"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { tipTierForCents, TIP_TIERS, type TipTier } from "../../lib/tip-tiers";
import type { TipAlert } from "./room-types";
import { TipBadge, TipMedal } from "./tip-medal";
import "./tip-effects.css";

type Celebration = { alert: TipAlert; tier: TipTier };

const PARTICLES: Record<string, number> = { bronze: 14, silver: 26, gold: 44, platinum: 70, diamond: 110, legendary: 170 };
const DURATION_MS: Record<string, number> = { bronze: 3200, silver: 3800, gold: 4400, platinum: 5000, diamond: 5800, legendary: 7000 };
// Semitones from A3 — each tier plays a longer, higher fanfare.
const FANFARES: Record<string, number[]> = {
  bronze: [3, 7],
  silver: [3, 7, 10],
  gold: [3, 7, 10, 15],
  platinum: [3, 7, 10, 15, 19],
  diamond: [3, 7, 10, 15, 19, 22, 27],
  legendary: [3, 7, 10, 15, 19, 22, 27, 31, 34],
};

function playTrumpet(tier: TipTier, context: AudioContext) {
  const notes = FANFARES[tier.id];
  const start = context.currentTime + 0.05;
  const step = tier.id === "legendary" ? 0.2 : 0.26;
  const master = context.createGain();
  master.gain.value = 0.22 + TIP_TIERS.indexOf(tier) * 0.03;
  master.connect(context.destination);
  notes.forEach((semitone, index) => {
    const last = index === notes.length - 1;
    const time = start + index * step;
    const length = last ? 1.1 : step * 0.9;
    const freq = 220 * 2 ** (semitone / 12);
    // Brass-like tone: detuned saw pair through a lowpass that "blats" open on attack.
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 3;
    filter.frequency.setValueAtTime(500, time);
    filter.frequency.exponentialRampToValueAtTime(3200, time + 0.06);
    filter.frequency.exponentialRampToValueAtTime(1400, time + length);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(1, time + 0.03);
    gain.gain.setValueAtTime(1, time + length - 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    filter.connect(gain);
    gain.connect(master);
    for (const detune of [-6, 6]) {
      const osc = context.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + length + 0.05);
    }
  });
}

function formatUsd(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
}

function Burst({ tier }: { tier: TipTier }) {
  const particles = useMemo(() => Array.from({ length: PARTICLES[tier.id] }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 25 + Math.random() * 60;
    return {
      key: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance - 10,
      delay: Math.random() * 0.5,
      size: 6 + Math.random() * 10,
      spin: Math.random() * 720 - 360,
      shape: i % 3,
      fall: Math.random() > 0.5,
    };
  }), [tier.id]);
  return (
    <div className="tipfx-burst" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.key}
          className={`tipfx-p shape-${p.shape} ${p.fall ? "fall" : ""}`}
          style={{
            ["--x" as string]: `${p.x}vmin`,
            ["--y" as string]: `${p.y}vmin`,
            ["--spin" as string]: `${p.spin}deg`,
            width: p.size,
            height: p.size,
            animationDelay: `${p.delay}s`,
            background: p.key % 2 ? tier.color : tier.glow,
          }}
        />
      ))}
    </div>
  );
}

// Full-screen celebration queue: sound + animation that scale with the tip's tier.
export default function TipCelebration({ alerts }: { alerts: TipAlert[] }) {
  const [queue, setQueue] = useState<Celebration[]>([]);
  const [current, setCurrent] = useState<Celebration | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const audio = useRef<AudioContext | null>(null);

  // Browsers only allow audio after a gesture; unlock on the first interaction.
  useEffect(() => {
    function unlock() {
      if (!audio.current) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) audio.current = new Ctor();
      }
      void audio.current?.resume();
    }
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const fresh = alerts.filter((alert) => !seen.current.has(alert.id));
    if (fresh.length === 0) return;
    fresh.forEach((alert) => seen.current.add(alert.id));
    setQueue((existing) => [
      ...existing,
      ...fresh.map((alert) => ({ alert, tier: tipTierForCents(alert.amountCents) ?? TIP_TIERS[0] })),
    ]);
  }, [alerts]);

  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next);
    if (audio.current?.state === "running") playTrumpet(next.tier, audio.current);
    const timer = window.setTimeout(() => setCurrent(null), DURATION_MS[next.tier.id]);
    return () => window.clearTimeout(timer);
  }, [current, queue]);

  if (!current) return null;
  const { alert, tier } = current;
  const rank = TIP_TIERS.indexOf(tier);
  return (
    <div
      className={`tipfx tipfx-${tier.id}`}
      style={{ ["--tier" as string]: tier.color, ["--glow" as string]: tier.glow, ["--rank" as string]: rank }}
      role="status"
      aria-live="polite"
    >
      <div className="tipfx-flash" aria-hidden="true" />
      {rank >= 2 && <div className="tipfx-rays" aria-hidden="true" />}
      <Burst tier={tier} />
      <div className="tipfx-card">
        <TipMedal tier={tier} size={96 + rank * 18} className="tipfx-medal" />
        <div className="tipfx-level">{tier.label} tip</div>
        <div className="tipfx-amount">{formatUsd(alert.amountCents)}</div>
        <div className="tipfx-who">
          <strong>{alert.name}</strong> <TipBadge tierId={alert.badge} />
        </div>
        {alert.song && <div className="tipfx-song">boosting {alert.song}</div>}
      </div>
    </div>
  );
}
