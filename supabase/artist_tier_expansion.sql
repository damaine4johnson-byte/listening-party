-- Expand the paid artist tiers. Run once after artist_tiers.sql on an existing project.
alter table public.host_profiles
  drop constraint if exists host_profiles_plan_tier_check;

update public.host_profiles
set plan_tier = case plan_tier
  when 'tier2' then 'tier3'
  when 'tier3' then 'tier4'
  else plan_tier
end;

alter table public.host_profiles
  add constraint host_profiles_plan_tier_check
  check (plan_tier in ('free', 'tier2', 'tier3', 'tier4'));
