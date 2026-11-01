import type { Metadata } from "next";
import { loadFeed } from "../feed/load-feed";
import { FeedShell } from "../feed/feed-shell";
import { PostCard } from "../feed/post-card";
import styles from "../social.module.css";

export const metadata: Metadata = {
  title: "The Listening Room | Famous Introvert",
  description: "News, testimonials and updates from Famous Introvert Listening Rooms.",
  alternates: { canonical: "/showcase" },
  openGraph: { url: "/showcase" },
};

export const dynamic = "force-dynamic";

export default async function ShowcasePage() {
  const { posts, authors } = await loadFeed(true);
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>The Listening Room</h1>
      <p className={styles.lead}>News, updates and what listeners and artists are saying.</p>
      <FeedShell postIds={posts.map((p) => p.id)} tabs={false}>
        {posts.length === 0 && <p className={styles.empty}>Nothing posted yet. Check back soon.</p>}
        {posts.map((post) => <PostCard key={post.id} post={post} author={post.host_id ? authors.get(post.host_id) ?? null : null} />)}
      </FeedShell>
    </main>
  );
}
