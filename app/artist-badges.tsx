import styles from "./artist-badges.module.css";

export function VerifiedBadge() {
  return <span className={styles.verified} title="Verified artist" aria-label="Verified artist">✓</span>;
}

export function LiveBadge({ title }: { title?: string }) {
  return <span className={styles.live} title={title || "Live now"}><i aria-hidden="true" />LIVE</span>;
}
