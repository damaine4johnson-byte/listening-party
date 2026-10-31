-- Bank withdrawals: members request a payout of earned coins; admins approve.
-- Run once on the project.
create table if not exists public.bank_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  coins integer not null check (coins > 0),
  status text not null default 'pending' check (status in ('pending','paid','canceled','rejected')),
  note text not null default '' check (char_length(note) <= 300),
  reviewed_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bank_withdrawals_user_idx on public.bank_withdrawals (user_id, created_at desc);
create index if not exists bank_withdrawals_status_idx on public.bank_withdrawals (status) where status = 'pending';

alter table public.bank_withdrawals enable row level security;
revoke all on public.bank_withdrawals from anon, authenticated;
