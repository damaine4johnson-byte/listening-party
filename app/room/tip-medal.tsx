import { useId } from "react";
import { tipTierById, type TipTier, type TipTierId } from "../../lib/tip-tiers";

const SYMBOLS: Record<TipTierId, string> = {
  bronze: "50,22 58,42 80,42 62,54 69,76 50,63 31,76 38,54 20,42 42,42",
  silver: "50,20 59,40 81,43 65,58 69,80 50,69 31,80 35,58 19,43 41,40",
  gold: "50,18 60,38 82,41 66,57 70,80 50,68 30,80 34,57 18,41 40,38",
  platinum: "50,20 76,35 76,65 50,80 24,65 24,35",
  diamond: "30,36 40,24 60,24 70,36 50,80",
  legendary: "24,66 22,34 38,50 50,26 62,50 78,34 76,66",
};

// Vector medal that represents a tip / tipper level.
export function TipMedal({ tier, size = 96, className = "" }: { tier: TipTier; size?: number; className?: string }) {
  const gradientId = useId();
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${tier.label} medal`}>
      <defs>
        <radialGradient id={gradientId} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor={tier.glow} />
          <stop offset="0.55" stopColor={tier.color} />
          <stop offset="1" stopColor="#1a1030" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill={`url(#${gradientId})`} stroke={tier.glow} strokeWidth="3" />
      <circle cx="50" cy="50" r="37" fill="none" stroke="rgb(255 255 255 / 55%)" strokeWidth="1.5" strokeDasharray="3 3" />
      <polygon points={SYMBOLS[tier.id]} fill="rgb(255 255 255 / 92%)" stroke={tier.glow} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// Small pill used next to a tipper's name.
export function TipBadge({ tierId, showLabel = true }: { tierId: string | null | undefined; showLabel?: boolean }) {
  const tier = tipTierById(tierId);
  if (!tier) return null;
  return (
    <span className="tip-badge" style={{ ["--tier" as string]: tier.color }} title={`${tier.label} tipper`}>
      <TipMedal tier={tier} size={16} />
      {showLabel && <span>{tier.label}</span>}
    </span>
  );
}
