import type { Metadata } from "next";
import Link from "next/link";
import { listPublicArtists } from "../../lib/artists-public";
import styles from "./artists.module.css";

export const metadata: Metadata = { title: "Artists | Famous Introvert", description: "Follow artists and get notified when they open a room." };
export const dynamic = "force-dynamic";

export default async function ArtistsPage() {
  const artists = await listPublicArtists().catch(() => []);
  return (
    <main className="wrap">
      <section className="panel">
        <h1>Artists</h1>
        <p className="muted">Follow an artist to be notified the moment they open a room.</p>
        {artists.length === 0 && <p className="muted">No artist profiles yet.</p>}
        <div className={styles.grid}>
          {artists.map((a) => (
            <Link key={a.handle} href={`/artists/${a.handle}`} className={styles.card}>
              {a.avatarUrl ? <img className={styles.avatar} src={a.avatarUrl} alt="" /> : <div className={styles.avatar}>{a.name.charAt(0).toUpperCase()}</div>}
              <h2 className={styles.name}>{a.name}</h2>
              {a.bio && <p className={styles.muted}>{a.bio.slice(0, 90)}</p>}
              <span className={styles.followers}>{a.followers.toLocaleString()} {a.followers === 1 ? "follower" : "followers"}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
