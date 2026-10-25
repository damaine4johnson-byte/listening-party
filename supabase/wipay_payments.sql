-- WiPay collection + PayPal payouts. Run once on an existing project (after paid_rooms.sql).
alter table public.host_profiles
  add column if not exists paypal_email text;

create table if not exists public.payment_orders (
  order_id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('entry', 'tip')),
  room_id uuid not null references public.rooms(id) on delete cascade,
  host_id text,
  track_id uuid references public.room_tracks(id) on delete set null,
  member_id uuid,
  display_name text,
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  wipay_transaction_id text unique,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.host_earnings (
  id uuid primary key default gen_random_uuid(),
  host_id text not null,
  order_id uuid not null unique references public.payment_orders(order_id) on delete cascade,
  gross_cents integer not null,
  fee_cents integer not null,
  net_cents integer not null,
  payout_batch_id text,
  paid_out_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists host_earnings_unpaid_idx on public.host_earnings (host_id) where paid_out_at is null;

alter table public.payment_orders enable row level security;
alter table public.host_earnings enable row level security;
revoke all on public.payment_orders from anon, authenticated;
revoke all on public.host_earnings from anon, authenticated;

notify pgrst, 'reload schema';
