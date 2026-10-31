-- Diagnostic: confirms whether artist_usernames actually exists in this project,
-- and if it does, shows what would appear there.
-- Run in the Supabase dashboard SQL editor. Then check the result.
select
  case when exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'artist_usernames'
  ) then 'TABLE EXISTS' else 'TABLE MISSING' end as status;
