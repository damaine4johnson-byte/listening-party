-- Artist usernames: one row per claimed username, enforced unique by the database.
-- Replaces the old usernames.json file in the "artist-usernames" storage bucket.
-- Run once on the Supabase project with the service role / SQL editor.
create table if not exists public.artist_usernames (
  username text primary key check (username ~ '^[a-z][a-z0-9_]{2,23}$'),
  host_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only the server (service role key) touches this table; no client grants.
alter table public.artist_usernames enable row level security;
revoke all on public.artist_usernames from anon, authenticated;
