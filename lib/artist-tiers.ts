export const ARTIST_TIERS = [
  {
    id: "free",
    name: "Tier 1",
    price: "Free",
    maxListeners: 100,
    ads: true,
    paidRooms: false,
    perks: [
      "Private listening rooms",
      "Custom artist bio and avatar",
      "Room names and descriptions",
      "Upload and arrange room tracks",
      "Shareable private invite links",
      "Shared playback, live chat, and reactions",
    ],
    notIncluded: ["Capacity above 100 listeners", "Ad-free rooms", "Paid entry rooms"],
  },
  {
    id: "tier2",
    name: "Tier 2",
    price: "Paid",
    maxListeners: 500,
    ads: false,
    paidRooms: true,
    perks: [
      "Private listening rooms",
      "Custom artist bio and avatar",
      "Room names and descriptions",
      "Upload and arrange room tracks",
      "Shareable private invite links",
      "Shared playback, live chat, and reactions",
      "Ad-free rooms when active",
      "Paid entry rooms (you set the fee; 10% platform fee)",
    ],
    notIncluded: ["Capacity above 500 listeners"],
  },
  {
    id: "tier3",
    name: "Tier 3",
    price: "Paid",
    maxListeners: 1000,
    ads: false,
    paidRooms: true,
    perks: [
      "Private listening rooms",
      "Custom artist bio and avatar",
      "Room names and descriptions",
      "Upload and arrange room tracks",
      "Shareable private invite links",
      "Shared playback, live chat, and reactions",
      "Ad-free rooms when active",
      "Paid entry rooms (you set the fee; 10% platform fee)",
    ],
    notIncluded: ["Capacity above 1,000 listeners"],
  },
  {
    id: "tier4",
    name: "Tier 4",
    price: "Paid",
    maxListeners: 10000,
    ads: false,
    paidRooms: true,
    perks: [
      "Private listening rooms",
      "Custom artist bio and avatar",
      "Room names and descriptions",
      "Upload and arrange room tracks",
      "Shareable private invite links",
      "Shared playback, live chat, and reactions",
      "Ad-free rooms when active",
      "Paid entry rooms (you set the fee; 10% platform fee)",
    ],
    notIncluded: ["Capacity above 10,000 listeners"],
  },
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