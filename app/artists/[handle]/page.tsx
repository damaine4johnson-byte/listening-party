import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicArtist } from "../../../lib/artists-public";
import { createSupabaseAdmin } from "../../../lib/supabase-admin";
import FollowButton from "../follow-button";
import styles from "../artists.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const artist = await getPublicArtist((await params).handle).catch(() => null);
  return { title: artist ? `${artist.name} | Famous Introvert` : "Artist | Famous Introvert" };
}

export default async function ArtistPage({ params }: { params: Promise<{ handle: string }> }) {
  const artist = await getPublicArtist((await params).handle).catch(() => null);
  if (!artist) notFound();

  const { data: rooms } = await createSupabaseAdmin().from("rooms")
    .select("id, title, status, entry_fee_cents").eq("host_id", artist.hostId).neq("status", "ended").order("created_at", { ascending: false }).limit(10);

  return (
    <main className="wrap">
      <section className="panel">
        <div className={styles.head}>
          {artist.avatarUrl ? <img className={`${styles.avatar} ${styles.big}`} src={artist.avatarUrl} alt="" /> : <div className={`${styles.avatar} ${styles.big}`}>{artist.name.charAt(0).toUpperCase()}</div>}
          <div>
            <h1>{artist.name}</h1>
            {artist.bio && <p className={styles.muted}>{artist.bio}</p>}
            <FollowButton handle={artist.handle} initialFollowers={artist.followers} />
          </div>
        </div>

        <h2 style={{ marginTop: 24 }}>Rooms</h2>
        {!rooms?.length && <p className="muted">No open rooms right now. Follow to be notified when one opens.</p>}
        <ul className={styles.rooms}>
          {(rooms ?? []).map((room) => (
            <li key={room.id as string}>
              <span>{room.title as string}{room.status === "live" ? " · 🔴 live" : ""}</span>
              <span className={`${styles.pill} ${(room.entry_fee_cents as number) > 0 ? styles.paid : ""}`}>
                {(room.entry_fee_cents as number) > 0 ? `$${((room.entry_fee_cents as number) / 100).toFixed(2)} entry` : "Free"}
              </span>
            </li>
          ))}
        </ul>
        <p className="muted">Followers receive the room code in their notifications. Free rooms open instantly; paid rooms ask for payment first.</p>
        <p><Link href="/artists">← All artists</Link></p>
      </section>
    </main>
  );
}
