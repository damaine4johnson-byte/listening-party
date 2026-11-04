-- VERIFY EVERYTHING: run this whole file in the Supabase SQL editor.
-- Each section prints a result row — check the "value" column against "expected".

-- 1. Which project/database am I actually connected to? (Compare with the
--    project ref shown at the top of the dashboard: tisenszkbwsfnprdtdyz)
select current_database() as database, inet_server_addr()::text as server;

-- 2. Does link_in_bio exist?
select case when exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='host_profiles' and column_name='link_in_bio'
) then 'YES' else 'NO — ALTER DID NOT RUN HERE' end as link_in_bio_exists;

-- 3. Does artist_usernames exist?
select case when exists (
  select 1 from information_schema.tables
  where table_schema='public' and table_name='artist_usernames'
) then 'YES' else 'NO — SQL DID NOT RUN HERE' end as artist_usernames_exists;

-- 4. Does bank_withdrawals exist?
select case when exists (
  select 1 from information_schema.tables
  where table_schema='public' and table_name='bank_withdrawals'
) then 'YES' else 'NO — SQL DID NOT RUN HERE' end as bank_withdrawals_exists;

-- 5. List every migration file's marker so you can see at a glance what's missing.
select 'tables in public schema:' as note;
select table_name from information_schema.tables
where table_schema='public'
order by table_name;
