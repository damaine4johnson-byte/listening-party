import "server-only";
import { createSupabaseAdmin } from "../../lib/supabase-admin";
import { discoverArtists, type DiscoverArtist } from "../../lib/discover";
import type { FeedPost, PostAuthor } from "./post-card";

const COLUMNS = "id, kind, title, body, author, created_at, media_path, media_type, author_type, host_id";
const LEGACY = "id, kind, title, body, author, created_at, media_path, media_type";

// `pinAdmin` keeps label posts above artist posts (The Listening Room); otherwise strictly newest first.
export async function loadFeed(pinAdmin: boolean): Promise<{ posts: FeedPost[]; authors: Map<string, PostAuthor>; artists: DiscoverArtist[] }> {
  const authors = new Map<string, PostAuthor>();
  let posts: FeedPost[] = [];
  const artists = await discoverArtists().catch(() => [] as DiscoverArtist[]);
  try {
    const db = createSupabaseAdmin();
    const [admin, artist] = await Promise.all([
      db.from("feed_posts").select(COLUMNS).eq("author_type", "admin").order("created_at", { ascending: false }).limit(50),
      db.from("feed_posts").select(COLUMNS).eq("author_type", "artist").order("created_at", { ascending: false }).limit(50),
    ]);
    if (admin.error) {
      const legacy = await db.from("feed_posts").select(LEGACY).order("created_at", { ascending: false }).limit(50);
      posts = legacy.error ? [] : (legacy.data as FeedPost[]);
    } else {
      const adminPosts = admin.data as FeedPost[];
      const artistPosts = (artist.data ?? []) as FeedPost[];
      posts = pinAdmin ? [...adminPosts, ...artistPosts] : [...adminPosts, ...artistPosts].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      for (const a of artists) authors.set(a.hostId, { handle: a.handle, name: a.name, avatarUrl: a.avatarUrl, verified: a.verified });
    }
  } catch { /* empty feed */ }
  return { posts, authors, artists };
}
