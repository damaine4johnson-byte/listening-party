-- Artist usernames (run once). Safe to re-run.
alter table public.host_profiles
  add column if not exists username text;

update public.host_profiles
set username = lower('artist_' || substring(host_id from 1 for 8))
where username is null;

create unique index if not exists host_profiles_username_key
  on public.host_profiles (lower(username));
