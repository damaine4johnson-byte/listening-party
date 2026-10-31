import type { Metadata } from "next";
import Link from "next/link";
import LogoMark from "../logo-mark";
import FeedComments from "../showcase/post-comments";
import { createSupabaseAdmin } from "../../lib/supabase-admin";
import { feedMediaUrl } from "../../lib/feed-media";
import { handleOf } from "../../lib/artists-public";
import { readUsernames as readArtistUsernames } from "../../lib/artist-username";
import styles from "../home.module.css";
import feed from "../showcase/feed.module.css";

export const metadata: Metadata = {
  title: "Feed | Famous Introvert",
  description: "Recent posts from artists on Famous Introvert Listening Rooms.",
  alternates: { canonical: "/feed" },
};

export const dynamic = "force-dynamic";

type Post = { id: string; kind: string; title: string; body: string; author: string; created_at: string; media_path: string | null; media_type: string | null; author_type?: "admin" | "artist"; host_id?: string | null };

const COLUMNS = "id, kind, title, body, author, created_at, media_path, media_type, author_type, host_id";

export default async function FeedPage() {
  let posts: Post[] = [];
  const handles = new Map<string, string>();
  try {
    const db = createSupabaseAdmin();
    const [admin, artist] = await Promise.all([
      db.from("feed_posts").select(COLUMNS).eq("author_type", "admin").order("created_at", { ascending: false }).limit(50),
      db.from("feed_posts").select(COLUMNS).eq("author_type", "artist").order("created_at", { ascending: false }).limit(50),
    ]);
    if (admin.error) {
      const legacy = await db.from("feed_posts").select("id, kind, title, body, author, created_at, media_path, media_type").order("created_at", { ascending: false }).limit(50);
      posts = legacy.error ? [] : (legacy.data as Post[]);
    } else {
      posts = [...(admin.data as Post[]), ...((artist.data ?? []) as Post[])].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      const names = await readArtistUsernames().catch(() => ({}) as Record<string, string>);
      for (const [username, hostId] of Object.entries(names)) handles.set(hostId, username);
    }
  } catch { /* empty feed */ }

  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand} aria-label="Famous Introvert Listening Rooms home">
          <LogoMark className={styles.logoImage} />
          <span className={styles.brandText}>
            <span>FAMOUS INTROVERT</span>
            <span>LISTENING ROOMS</span>
          </span>
        </Link>
        <div className={styles.navCenter}>FEED</div>
        <Link className={styles.artistLink} href="/#enter-room">Enter with an invite <span aria-hidden="true">↗</span></Link>
      </header>

      <section className={feed.feed} aria-labelledby="feed-title">
        <h1 id="feed-title">Feed</h1>
        <p className={feed.lead}>Recent posts from artists and the label — newest first.</p>
        {posts.length === 0 && <p className={feed.empty}>Nothing posted yet. Check back soon.</p>}
        {posts.map((post) => {
          const handle = post.author_type === "artist" && post.host_id ? handles.get(post.host_id) : null;
          return (
            <article key={post.id} className={`${feed.post} ${feed[post.kind as "info"] ?? ""} ${post.author_type === "artist" ? "" : feed.pinned}`}>
              <div className={feed.meta}>
                <span className={`${feed.tag} ${post.author_type === "artist" ? feed.artistTag : feed.adminTag}`}>
                  {post.author_type === "artist" ? (handle ? `@${handle}` : "Artist post") : `Admin · ${post.kind}`}
                </span>
                <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</time>
              </div>
              <h2>{post.title}</h2>
              {post.media_path && (post.media_type === "video"
                ? <video className={feed.media} src={feedMediaUrl(post.media_path) ?? undefined} controls playsInline preload="metadata" />
                : <img className={feed.media} src={feedMediaUrl(post.media_path) ?? ""} alt="" loading="lazy" />)}
              <p>{post.body}</p>
              {post.author_type === "artist" && post.host_id
                ? <div className={feed.byline}>— <Link href={`/artists/${handle ?? handleOf(post.host_id)}`}>{post.author || "Artist"}</Link></div>
                : post.author && <div className={feed.author}>— {post.author}</div>}
              <FeedComments postId={post.id} />
            </article>
          );
        })}
      </section>
    </main>
  );
}
