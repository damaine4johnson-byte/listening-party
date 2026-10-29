-- Unique, human-readable usernames for artists. Run once on the Supabase project.
-- Adds host_profiles.username: 3-24 chars, lowercase letters/numbers/underscore,
-- must start with a letter. Artists can use it in search and shareable links
-- like /artist/<username>. Only the SHA-256 hash of a room invite code is
-- stored elsewhere; usernames are plain-text (they are public by design).
alter table public.host_profiles
  add column if not exists username text;

-- Backfill: give every existing profile a unique placeholder handle derived
-- from their host id, so the NOT NULL + unique constraints can be applied.
update public.host_profiles
set username = lower('artist_' || substring(host_id from 1 for 8))
where username is null;

alter table public.host_profiles
  alter column username set not null,
  add constraint host_profiles_username_format
    check (username ~ '^[a-z][a-z0-9_]{2,23}$');

create unique index if not exists host_profiles_username_key
  on public.host_profiles (lower(username));

revoke all on public.host_profiles from anon;
grant select on public.host_profiles to authenticated;
