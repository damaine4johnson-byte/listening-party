-- Lets Google-created listeners also sign in with a username + password. Run once.
alter table public.listener_profiles add column if not exists username text;
alter table public.listener_profiles drop constraint if exists listener_profiles_username_format;
alter table public.listener_profiles add constraint listener_profiles_username_format
  check (username is null or username ~ '^[a-z0-9._-]{3,24}$');
create unique index if not exists listener_profiles_username_key on public.listener_profiles (username);

notify pgrst, 'reload schema';
