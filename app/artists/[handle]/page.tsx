import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicArtist } from "../../../lib/artists-public";
import { feedMediaUrl } from "../../../lib/feed-media";
import { createSupabaseAdmin } from "../../../lib/supabase-admin";
import FollowButton from "../follow-button";
import styles from "./profile.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const artist = await getPublicArtist((await params).handle).catch(() => null);
  return { title: artist ? `${artist.name} | Famous Introvert` : "Artist | Famous Introvert", description: artist?.bio || undefined };
}

type Post = { id: string; title: string; media_path: string | null; media_type: string | null };

export default async function ArtistPage({ params }: { params: Promise<{ handle: string }> }) {
  const artist = await getPublicArtist((await params).handle).catch(() => null);
  if (!artist) notFound();

  const db = createSupabaseAdmin();
  const [roomsResult, postsResult] = await Promise.all([
    db.from("rooms").select("id, title, status, entry_fee_cents").eq("host_id", artist.hostId).neq("status", "ended").order("created_at", { ascending: false }).limit(10),
    db.from("feed_posts").select("id, title, media_path, media_type").eq("host_id", artist.hostId).order("created_at", { ascending: false }).limit(30),
  ]);
  const rooms = roomsResult.data ?? [];
  // Before the follows/feed migration runs, the host_id column does not exist.
  const posts = (postsResult.error ? [] : postsResult.data) as Post[];
  const isLive = rooms.some((room) => room.status === "live");
  const initial = artist.name.charAt(0).toUpperCase();

  return (
    <main className={styles.page}>
      <div className={styles.cover} />
      <div className={styles.top}>
        <div className={styles.ring}>
          {artist.avatarUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img className={styles.avatar} src={artist.avatarUrl} alt="" />
            : <div className={styles.avatar}>{initial}</div>}
        </div>
        {isLive && <span className={styles.live}>● LIVE</span>}
      </div>

      <div className={styles.body}>
        <h1 className={styles.name}>{artist.name}</h1>
        {artist.bio && <p className={styles.bio}>{artist.bio}</p>}
        <div className={styles.stats}>
          <div className={styles.stat}><strong>{artist.followers.toLocaleString()}</strong><span>Followers</span></div>
          <div className={styles.stat}><strong>{rooms.length}</strong><span>Open rooms</span></div>
          <div className={styles.stat}><strong>{posts.length}</strong><span>Posts</span></div>
        </div>
        <FollowButton handle={artist.handle} initialFollowers={artist.followers} />
      </div>

      <section className={styles.section} style={{ marginTop: 22 }}>
        <h2>Rooms</h2>
        {rooms.length === 0 && <p className={styles.empty}>No open rooms right now. Follow to be notified when one opens.</p>}
        <div className={styles.rooms}>
          {rooms.map((room) => {
            const paid = (room.entry_fee_cents as number) > 0;
            return (
              <div key={room.id as string} className={styles.room}>
                <div><b>{room.title as string}</b><small>{room.status === "live" ? "🔴 Live now" : "Scheduled"}</small></div>
                <span className={`${styles.pill} ${paid ? styles.paid : ""}`}>{paid ? `$${((room.entry_fee_cents as number) / 100).toFixed(2)} entry` : "Free"}</span>
              </div>
            );
          })}
        </div>
        {rooms.length > 0 && <p className={styles.empty} style={{ marginTop: 10 }}>Followers get the room code in their notifications 🔔</p>}
      </section>

      <div className={styles.tabs}><span>Posts</span></div>
      <section className={styles.section}>
        {posts.length === 0 && <p className={styles.empty}>No posts yet.</p>}
        <div className={styles.grid}>
          {posts.map((post) => {
            const url = feedMediaUrl(post.media_path);
            return (
              <Link key={post.id} href="/showcase" className={styles.tile}>
                {url && (post.media_type === "video"
                  ? <><video src={url} muted playsInline preload="metadata" /><span className={styles.play}>▶</span></>
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={url} alt="" loading="lazy" />)}
                {url ? <span className={styles.cap}>{post.title}</span> : <span>{post.title}</span>}
              </Link>
            );
          })}
        </div>
      </section>

      <Link href="/artists" className={styles.back}>← All artists</Link>
    </main>
  );
}
