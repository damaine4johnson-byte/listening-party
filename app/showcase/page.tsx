import type { Metadata } from "next";
import Link from "next/link";
import LogoMark from "../logo-mark";
import { createSupabaseAdmin } from "../../lib/supabase-admin";
import { feedMediaUrl } from "../../lib/feed-media";
import styles from "../home.module.css";
import feed from "./feed.module.css";

export const metadata: Metadata = {
  title: "The Listening Room | Famous Introvert",
  description: "News, testimonials and updates from Famous Introvert Listening Rooms.",
  alternates: { canonical: "/showcase" },
  openGraph: { url: "/showcase" },
};

export const dynamic = "force-dynamic";

type Post = { id: string; kind: "info" | "testimonial" | "update"; title: string; body: string; author: string; created_at: string; media_path?: string | null; media_type?: "image" | "video" | null };
const LABELS = { info: "Information", testimonial: "Testimonial", update: "Website update" } as const;

async function loadPosts(): Promise<Post[]> {
  try {
    const db = createSupabaseAdmin();
    let result = await db.from("feed_posts").select("id, kind, title, body, author, created_at, media_path, media_type").order("created_at", { ascending: false }).limit(50);
    // Before the media migration runs, the media columns do not exist yet.
    if (result.error) result = await db.from("feed_posts").select("id, kind, title, body, author, created_at").order("created_at", { ascending: false }).limit(50) as typeof result;
    return result.error ? [] : (result.data as Post[]);
  } catch {
    return [];
  }
}

export default async function ShowcasePage() {
  const posts = await loadPosts();
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
          <article key={post.id} className={`${feed.post} ${feed[post.kind]}`}>
            <div className={feed.meta}>
              <span className={feed.tag}>{LABELS[post.kind]}</span>
              <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</time>
            </div>
            <h2>{post.title}</h2>
            {post.media_path && (post.media_type === "video"
              ? <video className={feed.media} src={feedMediaUrl(post.media_path) ?? undefined} controls playsInline preload="metadata" />
              : <img className={feed.media} src={feedMediaUrl(post.media_path) ?? ""} alt="" loading="lazy" />)}
            <p>{post.kind === "testimonial" ? `“${post.body}”` : post.body}</p>
            {post.author && <div className={feed.author}>— {post.author}</div>}
          </article>
        ))}
      </section>
    </main>
  );
}
