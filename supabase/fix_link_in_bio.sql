-- Run this in the Supabase SQL editor, then press RUN once and read the two
-- result grids it produces. This bypasses every cache by creating the column
-- and immediately reading it back *in the same transaction*.

-- A. Add the column (idempotent — safe even if it already exists).
alter table public.host_profiles
  add column if not exists link_in_bio text not null default '' check (char_length(link_in_bio) <= 300);

-- B. Read it back right now, from the same session. If this prints 'EXISTS',
--    the column is real in THIS database and any remaining API error is purely
--    a PostgREST schema-cache refresh that resolves within a minute.
select case when exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='host_profiles' and column_name='link_in_bio'
) then 'EXISTS — column is real in this database' else 'STILL MISSING — wrong project selected' end as result;

-- C. Show every column the table actually has, so nothing is left to guess.
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='host_profiles'
order by ordinal_position;
