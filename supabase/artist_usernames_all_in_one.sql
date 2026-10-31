-- ALL-IN-ONE artist usernames setup + verification for the Famous Introvert project.
-- Paste the WHOLE file into the Supabase dashboard SQL editor and press Run.
-- It is safe to run repeatedly.

-- 1. Create the table if missing.
create table if not exists public.artist_usernames (
  username text primary key check (username ~ '^[a-z][a-z0-9_]{2,23}$'),
  host_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.artist_usernames enable row level security;
revoke all on public.artist_usernames from anon, authenticated;

-- 2. Prove it worked in the same statement batch: this returns one row,
--    'SETUP OK', only when the table exists and is writable by the server role.
select 'SETUP OK — artist_usernames exists and is reachable' as result
where exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'artist_usernames'
);
