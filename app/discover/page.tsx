import type { Metadata } from "next";
import Link from "next/link";
import { discoverArtists, latestMediaPosts } from "../../lib/discover";
import { feedMediaUrl } from "../../lib/feed-media";
import ArtistSearch from "../artists/artist-search";
import { LiveBadge, VerifiedBadge } from "../artist-badges";
import { LiveNowStrip, StoriesRow } from "../stories-row";
import styles from "../social.module.css";

export const metadata: Metadata = { title: "Discover | Famous Introvert", description: "Find live rooms, trending artists and new media." };
export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const [artists, media] = await Promise.all([discoverArtists().catch(() => []), latestMediaPosts(12).catch(() => [])]);
  const trending = [...artists].sort((a, b) => b.followers - a.followers).slice(0, 12);
  return (
    <main className={`${styles.page} ${styles.wide}`}>
      <h1 className={styles.title}>Discover</h1>
      <p className={styles.lead}>Search for an artist, find a live room, or explore recent posts.</p>
      <ArtistSearch />
      <StoriesRow artists={artists} />
      <div className={styles.section}><h2>🔴 Live now</h2></div>
      <LiveNowStrip artists={artists} />
      <div className={styles.section}><h2>🔥 Trending artists</h2><Link href="/artists">See all artists</Link></div>
      {trending.length === 0 && <p className={styles.empty}>No artist profiles yet.</p>}
      <div className={styles.grid}>
        {trending.map((a) => (
          <Link key={a.hostId} href={`/artists/${a.handle}`} className={styles.artistCard}>
            <span className={styles.avatar}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {a.avatarUrl ? <img src={a.avatarUrl} alt="" /> : a.name.charAt(0).toUpperCase()}
            </span>
            <strong>{a.name}{a.verified && <VerifiedBadge />}</strong>
            {a.live && <LiveBadge />}
            <small>{a.followers.toLocaleString()} {a.followers === 1 ? "follower" : "followers"}</small>
          </Link>
        ))}
      </div>
      {media.length > 0 && (
        <>
          <div className={styles.section}><h2>🎬 New media</h2><Link href="/feed">Open feed</Link></div>
          <div className={styles.mediaGrid}>
            {media.map((m) => {
              const url = feedMediaUrl(m.media_path);
              return url ? (
                <Link key={m.id} href={`/feed#post-${m.id}`} className={styles.mediaTile}>
                  {m.media_type === "video" ? <video src={url} muted preload="metadata" /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt={m.title} loading="lazy" />}
                </Link>
              ) : null;
            })}
          </div>
        </>
      )}
    </main>
  );
}
