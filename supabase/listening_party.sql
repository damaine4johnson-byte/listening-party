-- Add listener reactions to an existing project.
create table if not exists public.room_reactions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  member_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 32),
  reaction text not null check (reaction in ('heart', 'fire', 'clap', 'laugh', 'wow')),
  created_at timestamptz not null default now(),
  foreign key (room_id, member_id)
    references public.room_memberships(room_id, member_id) on delete cascade
);

create index if not exists room_reactions_room_created_idx
  on public.room_reactions (room_id, created_at desc);

alter table public.room_reactions enable row level security;
revoke all on public.room_reactions from anon, authenticated;

notify pgrst, 'reload schema';