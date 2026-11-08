import type { Metadata } from "next";
import { StoriesRow } from "../stories-row";
import styles from "../social.module.css";
import { FeedShell } from "./feed-shell";
import { loadFeed } from "./load-feed";
import { PostCard } from "./post-card";
import { handleOf } from "../../lib/artists-public";

export const metadata: Metadata = {
  title: "Feed | Famous Introvert",
  description: "Recent posts from artists on Famous Introvert Listening Rooms.",
  alternates: { canonical: "/feed" },
};

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const { posts, authors, artists } = await loadFeed(false);
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Feed</h1>
      <StoriesRow artists={artists} />
      <FeedShell
        postIds={posts.map((p) => p.id)}
        postHosts={Object.fromEntries(posts.map((post) => [post.id, post.host_id ? handleOf(post.host_id) : null]))}
      >
        {posts.length === 0 && <p className={styles.empty}>Nothing posted yet. Check back soon.</p>}
        {posts.map((post) => <PostCard key={post.id} post={post} author={post.host_id ? authors.get(post.host_id) ?? null : null} />)}
      </FeedShell>
    </main>
  );
}
