-- Add developer-managed artist access and platform settings to an existing project.
alter table public.host_accounts
  add column if not exists account_status text not null default 'active';

alter table public.host_accounts
  drop constraint if exists host_accounts_account_status_check,
  add constraint host_accounts_account_status_check
    check (account_status in ('active', 'suspended'));

create table if not exists public.platform_settings (
  setting_key text primary key check (setting_key = 'global'),
  free_tier_ads_enabled boolean not null default true,
  free_tier_ad_title text not null default 'Host your own first listen',
  free_tier_ad_body text not null default 'Create an artist profile and bring your listeners together in a private room.',
  free_tier_ad_href text not null default '/signup',
  new_room_status text not null default 'scheduled' check (new_room_status in ('scheduled', 'live')),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (setting_key)
values ('global')
on conflict (setting_key) do nothing;

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;

notify pgrst, 'reload schema';