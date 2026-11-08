import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicArtist } from "../../../lib/artists-public";
import { feedMediaUrl } from "../../../lib/feed-media";
import { createSupabaseAdmin } from "../../../lib/supabase-admin";
import { cookies } from "next/headers";
import { HOST_SESSION_COOKIE } from "../../../lib/host-session";
import { readActiveHostSession } from "../../../lib/host-profile";
import { listGallery } from "../../../lib/artist-gallery";
import GalleryEditor from "../../host/profile/gallery-editor";
import galleryStyles from "./gallery.module.css";
import { verifiedHostIds } from "../../../lib/discover";
import { VerifiedBadge } from "../../artist-badges";
import FollowButton from "../follow-button";
import styles from "./profile.module.css";
import { listenerRoomDestination } from "../../../lib/listener-room-return";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const artist = await getPublicArtist((await params).handle).catch(() => null);
  return { title: artist ? `${artist.name} | Famous Introvert` : "Artist | Famous Introvert", description: artist?.bio || undefined };
}

type Post = { id: string; title: string; media_path: string | null; media_type: string | null };

export default async function ArtistPage({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ roomId?: string | string[] }> }) {
  const artist = await getPublicArtist((await params).handle).catch(() => null);
  if (!artist) notFound();

  const db = createSupabaseAdmin();
  const session = await readActiveHostSession((await cookies()).get(HOST_SESSION_COOKIE)?.value).catch(() => null);
  const isOwner = session?.hostId === artist.hostId;
  const requestedRoomId = (await searchParams).roomId;
  const validRoomId = typeof requestedRoomId === "string" && listenerRoomDestination(requestedRoomId) ? requestedRoomId : null;
  const [roomsResult, postsResult, galleryPhotos, returnRoomResult] = await Promise.all([
    db.from("rooms").select("id, title, status, entry_fee_cents").eq("host_id", artist.hostId).neq("status", "ended").order("created_at", { ascending: false }).limit(10),
    db.from("feed_posts").select("id, title, media_path, media_type").eq("host_id", artist.hostId).order("created_at", { ascending: false }).limit(30),
    listGallery(artist.hostId),
    validRoomId
      ? db.from("rooms").select("id").eq("id", validRoomId).eq("host_id", artist.hostId).eq("entry_fee_cents", 0).neq("status", "ended").maybeSingle()
      : Promise.resolve(null),
  ]);
  const rooms = roomsResult.data ?? [];
  if (returnRoomResult?.error) console.error("Artist return room lookup failed", { code: returnRoomResult.error.code });
  const returnRoomId = returnRoomResult?.data ? validRoomId ?? undefined : undefined;
  // Before the follows/feed migration runs, the host_id column does not exist.
  const posts = (postsResult.error ? [] : postsResult.data) as Post[];
  const liveRoom = rooms.find((room) => room.status === "live");
  const isLive = Boolean(liveRoom);
  const freeLiveRoom = liveRoom && Number(liveRoom.entry_fee_cents) === 0 ? liveRoom : null;
  const isVerified = (await verifiedHostIds().catch(() => new Set<string>())).has(artist.hostId);
  const initial = artist.name.charAt(0).toUpperCase();
  const username = /^[0-9a-f]{16}$/.test(artist.handle) ? artist.name : artist.handle;

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        {isLive ? (
          <Link
            className={styles.liveLink}
            href={freeLiveRoom ? `/?roomId=${encodeURIComponent(String(freeLiveRoom.id))}#enter-room` : "#rooms"}
            aria-label={freeLiveRoom ? `Join ${artist.name}'s free live room` : `See ${artist.name}'s live room details`}
          >
            <div className={styles.ring}>
              {artist.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img className={styles.avatar} src={artist.avatarUrl} alt="" />
                : <div className={styles.avatar}>{initial}</div>}
              <span className={styles.live}>LIVE</span>
            </div>
          </Link>
        ) : (
          <div className={styles.ring}>
            {artist.avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img className={styles.avatar} src={artist.avatarUrl} alt="" />
              : <div className={styles.avatar}>{initial}</div>}
          </div>
        )}
        <div className={styles.headMain}>
          <div className={styles.handleRow}>
            <h1 className={styles.username}>{username}{isVerified && <VerifiedBadge />}</h1>
            {isOwner
              ? <Link className={styles.editBtn} href="/host/profile">Edit profile</Link>
              : <FollowButton handle={artist.handle} returnRoomId={returnRoomId} />}
          </div>
          <div className={styles.stats}>
            <div className={styles.stat}><strong>{posts.length}</strong> posts</div>
            <div className={styles.stat}><strong>{artist.followers.toLocaleString()}</strong> {artist.followers === 1 ? "follower" : "followers"}</div>
            <div className={styles.stat}><strong>{rooms.length}</strong> rooms</div>
          </div>
        </div>
      </header>
      <div className={styles.bioBlock}>
        <b className={styles.name}>{artist.name}</b>
        {artist.bio && <p className={styles.bio}>{artist.bio}</p>}
        {artist.linkInBio && <a className={styles.linkInBio} href={artist.linkInBio} target="_blank" rel="noopener noreferrer">🔗 {artist.linkInBio.replace(/^https:\/\//, "")}</a>}
      </div>

      <section id="rooms" className={styles.section} style={{ marginTop: 18 }}>
        <h2>Rooms</h2>
        {rooms.length === 0 && <p className={styles.empty}>No open rooms right now. Follow to be notified when one opens.</p>}
        <div className={styles.rooms}>
          {rooms.map((room) => {
            const paid = (room.entry_fee_cents as number) > 0;
            return (
              <div key={room.id as string} className={styles.room}>
                <div><b>{room.title as string}</b><small>{room.status === "live" ? "🔴 Live now" : "Scheduled"}</small></div>
                <span className={`${styles.pill} ${paid ? styles.paid : ""}`}>{paid ? `$${((room.entry_fee_cents as number) / 100).toFixed(2)} entry` : "Free"}</span>
                {paid
                  ? <Link className={styles.joinRoom} href="/#enter-room">Enter invitation code</Link>
                  : <Link className={styles.joinRoom} href={`/?roomId=${encodeURIComponent(String(room.id))}#enter-room`}>Join free room</Link>}
              </div>
            );
          })}
        </div>
        {rooms.length > 0 && <p className={styles.empty} style={{ marginTop: 10 }}>Follow this artist and sign in to join free rooms without a code. Paid rooms require an invitation code; check your notifications or ask the artist.</p>}
      </section>

      {isOwner && <GalleryEditor />}

      {!isOwner && galleryPhotos.length > 0 && (
        <section className={styles.section} style={{ marginTop: 18 }}>
          <h2>Gallery</h2>
          <div className={galleryStyles.grid}>
            {galleryPhotos.map((photo) => (
              <figure key={photo.id} className={galleryStyles.tile}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={photo.caption || ""} loading="lazy" />
                {photo.caption && <figcaption className={galleryStyles.cap}>{photo.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      <div className={styles.tabs}><span>▦ Posts</span></div>
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
