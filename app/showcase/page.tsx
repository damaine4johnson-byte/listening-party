import type { Metadata } from "next";
import Link from "next/link";
import LogoMark from "../logo-mark";
import { createSupabaseAdmin } from "../../lib/supabase-admin";
import { feedMediaUrl } from "../../lib/feed-media";
import { handleOf } from "../../lib/artists-public";
import PostComments from "./post-comments";
import styles from "../home.module.css";
import feed from "./feed.module.css";

export const metadata: Metadata = {
  title: "The Listening Room | Famous Introvert",
  description: "News, testimonials and updates from Famous Introvert Listening Rooms.",
  alternates: { canonical: "/showcase" },
  openGraph: { url: "/showcase" },
};

export const dynamic = "force-dynamic";

type Post = { id: string; kind: "info" | "testimonial" | "update"; title: string; body: string; author: string; created_at: string; media_path?: string | null; media_type?: "image" | "video" | null; author_type?: "admin" | "artist"; host_id?: string | null };
const LABELS = { info: "Information", testimonial: "Testimonial", update: "Website update" } as const;

const COLUMNS = "id, kind, title, body, author, created_at, media_path, media_type, author_type, host_id";

// Admin posts always rank above artist posts; each group is newest first.
async function loadPosts(): Promise<{ posts: Post[]; artists: Map<string, string> }> {
  const artists = new Map<string, string>();
  try {
    const db = createSupabaseAdmin();
    const [admin, artist] = await Promise.all([
      db.from("feed_posts").select(COLUMNS).eq("author_type", "admin").order("created_at", { ascending: false }).limit(50),
      db.from("feed_posts").select(COLUMNS).eq("author_type", "artist").order("created_at", { ascending: false }).limit(50),
    ]);
    let posts: Post[];
    if (admin.error) {
      // Before the follows/feed migration runs, only the older columns exist.
      let legacy = await db.from("feed_posts").select("id, kind, title, body, author, created_at, media_path, media_type").order("created_at", { ascending: false }).limit(50);
      if (legacy.error) legacy = await db.from("feed_posts").select("id, kind, title, body, author, created_at").order("created_at", { ascending: false }).limit(50) as typeof legacy;
      posts = legacy.error ? [] : (legacy.data as Post[]);
    } else {
      posts = [...(admin.data as Post[]), ...((artist.data ?? []) as Post[])];
      const hostIds = [...new Set(posts.map((p) => p.host_id).filter((id): id is string => Boolean(id)))];
      if (hostIds.length) {
        const { data } = await db.from("host_profiles").select("host_id, display_name").in("host_id", hostIds);
        for (const row of data ?? []) artists.set(row.host_id as string, (row.display_name as string) || "Artist");
      }
    }
    return { posts, artists };
  } catch {
    return { posts: [], artists };
  }
}

export default async function ShowcasePage() {
  const { posts, artists } = await loadPosts();
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
        <div className={styles.navCenter}>THE LISTENING ROOM <span>·</span> FEED</div>
        <Link className={styles.artistLink} href="/#enter-room">Enter with an invite <span aria-hidden="true">↗</span></Link>
      </header>

      <section className={feed.feed} aria-labelledby="feed-title">
        <h1 id="feed-title">The Listening Room</h1>
        <p className={feed.lead}>News, updates and what listeners and artists are saying.</p>
        {posts.length === 0 && <p className={feed.empty}>Nothing posted yet. Check back soon.</p>}
        {posts.map((post) => (
          <article key={post.id} className={`${feed.post} ${feed[post.kind]} ${post.author_type === "artist" ? "" : feed.pinned}`}>
            <div className={feed.meta}>
              <span className={`${feed.tag} ${post.author_type === "artist" ? feed.artistTag : feed.adminTag}`}>{post.author_type === "artist" ? "Artist post" : `Admin · ${LABELS[post.kind]}`}</span>
              <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</time>
            </div>
            <h2>{post.title}</h2>
            {post.media_path && (post.media_type === "video"
              ? <video className={feed.media} src={feedMediaUrl(post.media_path) ?? undefined} controls playsInline preload="metadata" />
              : <img className={feed.media} src={feedMediaUrl(post.media_path) ?? ""} alt="" loading="lazy" />)}
            <p>{post.kind === "testimonial" ? `“${post.body}”` : post.body}</p>
            {post.author_type === "artist" && post.host_id
              ? <div className={feed.byline}>— <Link href={`/artists/${handleOf(post.host_id)}`}>{artists.get(post.host_id) ?? "Artist"}</Link></div>
              : post.author && <div className={feed.author}>— {post.author}</div>}
            <PostComments postId={post.id} />
          </article>
        ))}
      </section>
    </main>
  );
}
