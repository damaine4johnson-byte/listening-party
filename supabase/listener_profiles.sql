-- Listener profiles: public display name, bio and avatar for signed-in listeners.
-- Run once on the Supabase project (after schema.sql on fresh projects).
create table if not exists public.listener_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 32),
  bio text not null default '' check (char_length(bio) <= 200),
  avatar_url text not null default '' check (char_length(avatar_url) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.listener_profiles enable row level security;

-- Listeners may only read and edit their own profile; the anon key can do
-- nothing because there is no public grant.
drop policy if exists "listener profiles select own" on public.listener_profiles;
create policy "listener profiles select own" on public.listener_profiles
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "listener profiles insert own" on public.listener_profiles;
create policy "listener profiles insert own" on public.listener_profiles
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "listener profiles update own" on public.listener_profiles;
create policy "listener profiles update own" on public.listener_profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.listener_profiles from anon;
grant select, insert, update on public.listener_profiles to authenticated;
