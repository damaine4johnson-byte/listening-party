-- Starter schema. Apply to a fresh Supabase project.
create extension if not exists pgcrypto;

create table if not exists public.host_accounts (
  host_id text primary key check (host_id ~ '^[a-f0-9]{64}$'),
  auth_provider text not null check (auth_provider in ('password','google')),
  account_identity text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.host_profiles (
  host_id text primary key references public.host_accounts(host_id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  bio text not null default '' check (char_length(bio) <= 400),
  avatar_url text not null default '' check (char_length(avatar_url) <= 2048),
  contact_email text not null default '' check (char_length(contact_email) <= 320),
  plan_tier text not null default 'free' check (plan_tier in ('free', 'tier2', 'tier3')),
  subscription_status text not null default 'active' check (subscription_status in ('active', 'pending', 'canceled')),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  host_user_id uuid references auth.users(id) on delete set null,
  host_id text references public.host_accounts(host_id) on delete set null,
  invite_code_hash text not null,
  max_listeners integer not null default 100 check (max_listeners between 1 and 10000),
  status text not null default 'scheduled' check (status in ('scheduled','live','ended')),
  starts_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.room_tracks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  title text not null,
  storage_path text not null,
  duration_seconds integer,
  track_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.room_state (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  track_id uuid references public.room_tracks(id) on delete set null,
  status text not null default 'paused' check (status in ('playing','paused')),
  position_seconds double precision not null default 0,
  started_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.room_chat (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.room_memberships (
  room_id uuid not null references public.rooms(id) on delete cascade,
  member_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 32),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, member_id)
);

create or replace function public.join_room_with_limit(
  p_room_id uuid,
  p_member_id uuid,
  p_display_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_active_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_room_id::text, 0));

  select max_listeners into v_limit
  from public.rooms
  where id = p_room_id and status <> 'ended';

  if not found then
    return false;
  end if;

  delete from public.room_memberships
  where room_id = p_room_id and last_seen_at < pg_catalog.now() - interval '10 minutes';

  if not exists (
    select 1 from public.room_memberships
    where room_id = p_room_id and member_id = p_member_id
  ) then
    select pg_catalog.count(*) into v_active_count
    from public.room_memberships
    where room_id = p_room_id and last_seen_at >= pg_catalog.now() - interval '10 minutes';

    if v_active_count >= v_limit then
      return false;
    end if;
  end if;

  insert into public.room_memberships (room_id, member_id, display_name, last_seen_at)
  values (p_room_id, p_member_id, p_display_name, pg_catalog.now())
  on conflict (room_id, member_id) do update
    set display_name = excluded.display_name, last_seen_at = excluded.last_seen_at;

  return true;
end;
$$;

-- Do not enable broad public access for production. These starter policies deny
-- direct anonymous table access by default. Add narrowly scoped policies only
-- after implementing server-side invite validation / membership records.
alter table public.rooms enable row level security;
alter table public.room_tracks enable row level security;
alter table public.room_state enable row level security;
alter table public.room_chat enable row level security;
alter table public.host_accounts enable row level security;
alter table public.host_profiles enable row level security;
alter table public.room_memberships enable row level security;

revoke all on public.rooms from anon, authenticated;
revoke all on public.room_tracks from anon, authenticated;
revoke all on public.room_state from anon, authenticated;
revoke all on public.room_chat from anon, authenticated;
revoke all on public.host_accounts from anon, authenticated;
revoke all on public.host_profiles from anon, authenticated;
revoke all on public.room_memberships from anon, authenticated;

-- Enable Realtime for these tables in Supabase Dashboard after authorization
-- has been implemented. Never expose the service-role key to the browser.
revoke all on function public.join_room_with_limit(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.join_room_with_limit(uuid, uuid, text) to service_role;
