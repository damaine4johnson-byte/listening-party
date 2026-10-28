// Shared by the server (to rank tippers) and the UI (animations and badges).
export type TipTierId = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "legendary";

export type TipTier = {
  id: TipTierId;
  label: string;
  minCents: number;
  color: string;
  glow: string;
  emoji: string;
};

export const TIP_TIERS: readonly TipTier[] = [
  { id: "bronze", label: "Bronze", minCents: 1, color: "#cd7f32", glow: "#ffb566", emoji: "🥉" },
  { id: "silver", label: "Silver", minCents: 1_000, color: "#c8d0da", glow: "#eef4ff", emoji: "🥈" },
  { id: "gold", label: "Gold", minCents: 5_000, color: "#ffc933", glow: "#fff0a8", emoji: "🥇" },
  { id: "platinum", label: "Platinum", minCents: 10_000, color: "#7fe3d6", glow: "#d5fff9", emoji: "💠" },
  { id: "diamond", label: "Diamond", minCents: 50_000, color: "#5cc8ff", glow: "#c7ecff", emoji: "💎" },
  { id: "legendary", label: "Legendary", minCents: 100_000, color: "#c85bff", glow: "#ffd1ff", emoji: "👑" },
];

// Highest tier whose minimum is met; null for nothing sent.
export function tipTierForCents(cents: number): TipTier | null {
  let match: TipTier | null = null;
  for (const tier of TIP_TIERS) if (cents >= tier.minCents) match = tier;
  return match;
}

export function nextTipTier(cents: number): TipTier | null {
  return TIP_TIERS.find((tier) => tier.minCents > cents) ?? null;
}

export function tipTierById(id: string | null | undefined): TipTier | null {
  return TIP_TIERS.find((tier) => tier.id === id) ?? null;
}
