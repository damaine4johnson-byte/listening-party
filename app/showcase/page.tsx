import type { Metadata } from "next";
import Link from "next/link";
import LogoMark from "../logo-mark";
import { createSupabaseAdmin } from "../../lib/supabase-admin";
import styles from "../home.module.css";
import feed from "./feed.module.css";

export const metadata: Metadata = {
  title: "The Listening Room | Famous Introvert",
  description: "News, testimonials and updates from Famous Introvert Listening Rooms.",
  alternates: { canonical: "/showcase" },
  openGraph: { url: "/showcase" },
};

export const dynamic = "force-dynamic";

type Post = { id: string; kind: "info" | "testimonial" | "update"; title: string; body: string; author: string; created_at: string };
const LABELS = { info: "Information", testimonial: "Testimonial", update: "Website update" } as const;

async function loadPosts(): Promise<Post[]> {
  try {
    const { data, error } = await createSupabaseAdmin()
      .from("feed_posts")
      .select("id, kind, title, body, author, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    return error ? [] : (data as Post[]);
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
            <p>{post.kind === "testimonial" ? `“${post.body}”` : post.body}</p>
            {post.author && <div className={feed.author}>— {post.author}</div>}
          </article>
        ))}
      </section>
    </main>
  );
}
