-- Add host-owned account and profile data to an existing project.
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
  updated_at timestamptz not null default now()
);

alter table public.rooms
  add column if not exists host_id text references public.host_accounts(host_id) on delete set null;

alter table public.host_accounts enable row level security;
alter table public.host_profiles enable row level security;
revoke all on public.host_accounts from anon, authenticated;
revoke all on public.host_profiles from anon, authenticated;

notify pgrst, 'reload schema';