import Link from "next/link";
import type { DiscoverArtist } from "../lib/discover";
import styles from "./social.module.css";

// Instagram-style highlights: live artists first, then artists who posted this week.
export function StoriesRow({ artists }: { artists: DiscoverArtist[] }) {
  const items = [...artists.filter((a) => a.live), ...artists.filter((a) => !a.live && a.hasRecentPost)].slice(0, 20);
  if (items.length === 0) return null;
  return (
    <div className={styles.stories} aria-label="Artist highlights">
      {items.map((a) => (
        <Link key={a.hostId} href={`/artists/${a.handle}`} className={styles.story}>
          <span className={`${styles.ring} ${a.live ? styles.liveRing : styles.fresh}`}>
            <span className={styles.ringInner}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {a.avatarUrl ? <img src={a.avatarUrl} alt="" /> : a.name.charAt(0).toUpperCase()}
            </span>
          </span>
          {a.live && <span className={styles.liveTag}>LIVE</span>}
          <span className={styles.storyName}>{a.name}</span>
        </Link>
      ))}
    </div>
  );
}

export function LiveNowStrip({ artists }: { artists: DiscoverArtist[] }) {
  const live = artists.filter((a) => a.live);
  if (live.length === 0) return <p className={styles.empty}>No one is live right now. Follow artists to get notified when they open a room.</p>;
  return (
    <div className={styles.liveStrip}>
      {live.map((a) => (
        <Link key={a.hostId} href={`/artists/${a.handle}`} className={styles.liveCard}>
          <span className={`${styles.ring} ${styles.liveRing}`} style={{ width: 52, height: 52, margin: 0 }}>
            <span className={styles.ringInner} style={{ fontSize: 18 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {a.avatarUrl ? <img src={a.avatarUrl} alt="" /> : a.name.charAt(0).toUpperCase()}
            </span>
          </span>
          <span>
            <strong>{a.name}</strong>
            <small>🔴 {a.liveTitle || "Live now"}</small>
          </span>
        </Link>
      ))}
    </div>
  );
}
