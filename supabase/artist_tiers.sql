-- Add artist plans and active-listener tracking to an existing project.
alter table public.host_profiles
  add column if not exists plan_tier text not null default 'free',
  add column if not exists subscription_status text not null default 'active';

alter table public.host_profiles
  drop constraint if exists host_profiles_plan_tier_check,
  drop constraint if exists host_profiles_subscription_status_check,
  add constraint host_profiles_plan_tier_check check (plan_tier in ('free', 'tier2', 'tier3')),
  add constraint host_profiles_subscription_status_check check (subscription_status in ('active', 'pending', 'canceled'));

alter table public.rooms drop constraint if exists rooms_max_listeners_check;
alter table public.rooms add constraint rooms_max_listeners_check check (max_listeners between 1 and 10000);

create table if not exists public.room_memberships (
  room_id uuid not null references public.rooms(id) on delete cascade,
  member_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 32),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, member_id)
);

alter table public.room_memberships enable row level security;
revoke all on public.room_memberships from anon, authenticated;

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

revoke all on function public.join_room_with_limit(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.join_room_with_limit(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';