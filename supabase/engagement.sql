-- Likes, saved posts, track likes and verified artists. Run once; safe to re-run.
create table if not exists public.post_likes (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_likes_post_idx on public.post_likes (post_id);

create table if not exists public.post_saves (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_saves_user_idx on public.post_saves (user_id, created_at desc);

create table if not exists public.track_likes (
  track_id uuid not null references public.room_tracks(id) on delete cascade,
  member_id text not null,
  created_at timestamptz not null default now(),
  primary key (track_id, member_id)
);

create table if not exists public.artist_verified (
  host_id text primary key references public.host_accounts(host_id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.post_likes enable row level security;
alter table public.post_saves enable row level security;
alter table public.track_likes enable row level security;
alter table public.artist_verified enable row level security;
revoke all on public.post_likes, public.post_saves, public.track_likes, public.artist_verified from anon, authenticated;

notify pgrst, 'reload schema';

-- One emoji reaction per listener per post.
create table if not exists public.post_reactions (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('fire','clap','laugh','wow','sad')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_reactions_post_idx on public.post_reactions (post_id);
alter table public.post_reactions enable row level security;
revoke all on public.post_reactions from anon, authenticated;
