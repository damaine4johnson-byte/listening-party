-- Atomic queue reordering for room tracks. Run once on the Supabase project.
-- Replaces the per-row update loop in lib/room-queue.ts with a single
-- transactional call that reassigns every track_order in the room at once.
create or replace function public.reorder_room_tracks(
  p_room_id uuid,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Validate that the ordered ids exactly match the room's current track set.
  if (
    select count(*) from public.room_tracks
    where room_id = p_room_id
  ) <> coalesce(array_length(p_ordered_ids, 1), 0) then
    raise exception 'ordered track ids do not match the room playlist';
  end if;

  -- Verify no duplicate ids were supplied.
  if (select count(*) from unnest(p_ordered_ids) as id) <> (
    select count(distinct id) from unnest(p_ordered_ids) as id
  ) then
    raise exception 'ordered track ids contain duplicates';
  end if;

  -- Single-statement reassignment: every track_order in the room is written
  -- atomically (statement-level atomicity), so a failure or concurrent caller
  -- can never leave a partially reordered playlist behind.
  with ranking as (
    select t.id, (ord.index)::integer as new_order
    from unnest(p_ordered_ids) with ordinality as ord(id, index)
    join public.room_tracks t on t.id = ord.id and t.room_id = p_room_id
  )
  update public.room_tracks t
  set track_order = r.new_order
  from ranking r
  where t.id = r.id and t.room_id = p_room_id;
end;
$$;

revoke all on function public.reorder_room_tracks(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_room_tracks(uuid, uuid[]) to service_role;
