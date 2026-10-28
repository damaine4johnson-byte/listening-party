-- Public feed on the "Listening Room" page (info, testimonials, site updates). Run once.
create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'update' check (kind in ('info', 'testimonial', 'update')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 1500),
  author text not null default '' check (char_length(author) <= 80),
  created_at timestamptz not null default now()
);
create index if not exists feed_posts_created_idx on public.feed_posts (created_at desc);
alter table public.feed_posts enable row level security;
revoke all on public.feed_posts from anon, authenticated;

notify pgrst, 'reload schema';

-- Photo / video attachments on feed posts.
alter table public.feed_posts add column if not exists media_path text;
alter table public.feed_posts add column if not exists media_type text check (media_type in ('image', 'video'));

notify pgrst, 'reload schema';
