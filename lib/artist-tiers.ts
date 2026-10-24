export const ARTIST_TIERS = [
  { id: "free", name: "Tier 1", price: "Free", maxListeners: 100, ads: true },
  { id: "tier2", name: "Tier 2", price: "Paid", maxListeners: 1000, ads: false },
  { id: "tier3", name: "Tier 3", price: "Paid", maxListeners: 10000, ads: false },
] as const;

export type ArtistTier = (typeof ARTIST_TIERS)[number]["id"];

export function isArtistTier(value: unknown): value is ArtistTier {
  return ARTIST_TIERS.some((tier) => tier.id === value);
}

export function effectiveArtistTier(tier: ArtistTier, subscriptionStatus: string) {
  return tier === "free" || subscriptionStatus === "active" ? tier : "free";
}

export function artistTierDetails(tier: ArtistTier) {
  return ARTIST_TIERS.find((option) => option.id === tier)!;
}