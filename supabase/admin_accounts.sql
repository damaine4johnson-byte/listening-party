-- Admin accounts with roles and an audit log. Apply in the Supabase SQL editor.
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null check (username ~ '^([A-Za-z0-9._-]{3,40}|[^\s@]{1,64}@[^\s@]{1,255})$'),
  password_hash text not null,
  role text not null default 'viewer' check (role in ('owner', 'admin', 'viewer')),
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_username text not null,
  action text not null,
  target text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

alter table public.admin_users enable row level security;
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_users from anon, authenticated;
revoke all on public.admin_audit_log from anon, authenticated;

notify pgrst, 'reload schema';
