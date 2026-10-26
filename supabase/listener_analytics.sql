-- Listener photos and per-room visit log for host analytics.
alter table public.room_memberships add column if not exists avatar_url text;

create table if not exists public.room_visits (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  member_id uuid not null,
  display_name text not null,
  avatar_url text,
  joined_at timestamptz not null default now(),
  unique (room_id, member_id)
);

create index if not exists room_visits_room_idx on public.room_visits (room_id, joined_at desc);

alter table public.room_visits enable row level security;
revoke all on table public.room_visits from anon, authenticated;

notify pgrst, 'reload schema';
