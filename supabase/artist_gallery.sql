-- Artist gallery: photos an artist imports (device or Instagram download) shown
-- on their public /artists/<username> profile. Run once on the project.
create table if not exists public.artist_gallery (
  id uuid primary key default gen_random_uuid(),
  host_id text not null,
  media_path text not null unique,
  caption text not null default '' check (char_length(caption) <= 200),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists artist_gallery_host_idx on public.artist_gallery (host_id, position, created_at);

alter table public.artist_gallery enable row level security;
revoke all on public.artist_gallery from anon, authenticated;
