import Link from "next/link";
import { handleOf } from "../../lib/artists-public";
import { feedMediaUrl } from "../../lib/feed-media";
import { VerifiedBadge } from "../artist-badges";
import styles from "../social.module.css";
import { FeedItem } from "./feed-shell";
import { PostFooter } from "./post-footer";

export type FeedPost = {
  id: string; kind: string; title: string; body: string; author: string; created_at: string;
  media_path: string | null; media_type: string | null; author_type?: "admin" | "artist"; host_id?: string | null;
};
export type PostAuthor = { handle: string; name: string; avatarUrl: string; verified: boolean };

const KIND_LABELS: Record<string, string> = { info: "Info", testimonial: "Testimonial", update: "Update" };

export function PostCard({ post, author }: { post: FeedPost; author: PostAuthor | null }) {
  const isArtist = post.author_type === "artist" && Boolean(post.host_id);
  const name = isArtist ? (author?.name || post.author || "Artist") : (post.author || "Famous Introvert");
  const handle = isArtist ? (author?.handle ?? handleOf(post.host_id as string)) : null;
  const mediaUrl = feedMediaUrl(post.media_path);
  const avatar = (
    <span className={styles.avatar}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {author?.avatarUrl ? <img src={author.avatarUrl} alt="" /> : name.charAt(0).toUpperCase()}
    </span>
  );
  return (
    <FeedItem postId={post.id} hostKey={post.host_id ? handleOf(post.host_id) : null}>
      <article id={`post-${post.id}`} className={`${styles.post} ${post.kind === "testimonial" ? styles.quote : ""}`}>
        <header className={styles.postHead}>
          {handle ? <Link href={`/artists/${handle}`}>{avatar}</Link> : avatar}
          <div className={styles.who}>
            {handle ? <Link href={`/artists/${handle}`}>{name}</Link> : <strong>{name}</strong>}
            {author?.verified && <VerifiedBadge />}
            <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</time>
          </div>
          {!isArtist && <span className={styles.kind}>{KIND_LABELS[post.kind] ?? "Update"}</span>}
        </header>
        {mediaUrl && (post.media_type === "video"
          ? <video className={styles.media} src={mediaUrl} controls playsInline preload="metadata" />
          // eslint-disable-next-line @next/next/no-img-element
          : <img className={styles.media} src={mediaUrl} alt="" loading="lazy" />)}
        <div className={styles.body}>
          <h2>{post.title}</h2>
          <p>{post.kind === "testimonial" ? `“${post.body}”` : post.body}</p>
        </div>
        <PostFooter postId={post.id} shareTitle={post.title} />
      </article>
    </FeedItem>
  );
}
