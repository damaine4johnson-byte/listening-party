-- Artist follows, listener notifications, artist feed posts and feed comments. Run once.
-- Safe on a fresh project: it also creates the feed_posts table if it is missing.

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
alter table public.feed_posts add column if not exists media_path text;
alter table public.feed_posts add column if not exists media_type text check (media_type in ('image', 'video'));

create table if not exists public.artist_follows (
  listener_user_id uuid not null references auth.users(id) on delete cascade,
  host_id text not null references public.host_accounts(host_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listener_user_id, host_id)
);
create index if not exists artist_follows_host_idx on public.artist_follows (host_id);

create table if not exists public.listener_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  host_id text references public.host_accounts(host_id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,
  kind text not null default 'room' check (kind in ('room', 'live')),
  title text not null check (char_length(title) <= 160),
  body text not null default '' check (char_length(body) <= 500),
  room_code text not null default '',
  link text not null default '',
  paid boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists listener_notifications_user_idx on public.listener_notifications (user_id, created_at desc);

alter table public.feed_posts add column if not exists author_type text not null default 'admin';
alter table public.feed_posts add column if not exists host_id text references public.host_accounts(host_id) on delete cascade;
create index if not exists feed_posts_order_idx on public.feed_posts (author_type, created_at desc);

create table if not exists public.feed_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 40),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists feed_comments_post_idx on public.feed_comments (post_id, created_at);

alter table public.artist_follows enable row level security;
alter table public.listener_notifications enable row level security;
alter table public.feed_comments enable row level security;
revoke all on public.artist_follows from anon, authenticated;
revoke all on public.listener_notifications from anon, authenticated;
revoke all on public.feed_comments from anon, authenticated;

notify pgrst, 'reload schema';
