-- Listener coin wallets. Run after wipay_payments.sql.
alter table public.payment_orders
  drop constraint if exists payment_orders_kind_check;
alter table public.payment_orders
  add constraint payment_orders_kind_check check (kind in ('entry', 'tip', 'coin_purchase'));
alter table public.payment_orders alter column room_id drop not null;
alter table public.payment_orders
  add column if not exists listener_user_id uuid references auth.users(id) on delete set null,
  add column if not exists coins_purchased integer not null default 0 check (coins_purchased >= 0),
  add column if not exists coins_spent integer not null default 0 check (coins_spent >= 0);

create table if not exists public.listener_coin_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_coins integer not null default 0 check (balance_coins >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.listener_coin_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null unique references public.payment_orders(order_id) on delete cascade,
  coins_delta integer not null check (coins_delta <> 0),
  created_at timestamptz not null default now()
);

alter table public.listener_coin_wallets enable row level security;
alter table public.listener_coin_ledger enable row level security;
revoke all on public.listener_coin_wallets from anon, authenticated;
revoke all on public.listener_coin_ledger from anon, authenticated;

create or replace function public.settle_listener_coin_purchase(p_order_id uuid, p_transaction_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase public.payment_orders%rowtype;
begin
  select * into purchase
  from public.payment_orders
  where order_id = p_order_id and kind = 'coin_purchase'
  for update;

  if not found or purchase.status <> 'pending' or purchase.coins_purchased <= 0 or purchase.listener_user_id is null then
    return false;
  end if;

  update public.payment_orders
  set status = 'paid', paid_at = now(), wipay_transaction_id = p_transaction_id
  where order_id = p_order_id and status = 'pending';

  if not found then
    return false;
  end if;

  insert into public.listener_coin_wallets (user_id, balance_coins)
  values (purchase.listener_user_id, purchase.coins_purchased)
  on conflict (user_id) do update
  set balance_coins = public.listener_coin_wallets.balance_coins + excluded.balance_coins,
      updated_at = now();

  insert into public.listener_coin_ledger (user_id, order_id, coins_delta)
  values (purchase.listener_user_id, p_order_id, purchase.coins_purchased);
  return true;
end;
$$;

create or replace function public.spend_listener_coins(
  p_user_id uuid,
  p_kind text,
  p_room_id uuid,
  p_host_id text,
  p_track_id uuid,
  p_member_id uuid,
  p_display_name text,
  p_coins integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  order_id uuid;
  amount_cents integer;
  fee_cents integer;
begin
  if p_kind not in ('entry', 'tip') or p_coins <= 0 or p_coins > 1000000 then
    raise exception 'Invalid coin payment';
  end if;
  if p_kind = 'tip' and p_track_id is null then
    raise exception 'A track is required for a coin tip';
  end if;
  amount_cents := p_coins * 10;
  fee_cents := round(amount_cents * 0.10);

  insert into public.listener_coin_wallets (user_id, balance_coins)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update public.listener_coin_wallets
  set balance_coins = balance_coins - p_coins, updated_at = now()
  where user_id = p_user_id and balance_coins >= p_coins;
  if not found then
    raise exception 'Insufficient coin balance';
  end if;

  insert into public.payment_orders (
    kind, room_id, host_id, track_id, member_id, listener_user_id,
    display_name, amount_cents, coins_spent, status, paid_at
  )
  values (
    p_kind, p_room_id, p_host_id, p_track_id, p_member_id, p_user_id,
    left(p_display_name, 32), amount_cents, p_coins, 'paid', now()
  )
  returning payment_orders.order_id into order_id;

  insert into public.listener_coin_ledger (user_id, order_id, coins_delta)
  values (p_user_id, order_id, -p_coins);

  if p_host_id is not null then
    insert into public.host_earnings (host_id, order_id, gross_cents, fee_cents, net_cents)
    values (p_host_id, order_id, amount_cents, fee_cents, amount_cents - fee_cents);
  end if;

  return order_id;
end;
$$;

revoke all on function public.settle_listener_coin_purchase(uuid, text) from public, anon, authenticated;
revoke all on function public.spend_listener_coins(uuid, text, uuid, text, uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.settle_listener_coin_purchase(uuid, text) to service_role;
grant execute on function public.spend_listener_coins(uuid, text, uuid, text, uuid, uuid, text, integer) to service_role;

create table if not exists public.iap_coin_events (
  event_id text primary key,
  transaction_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  coins integer not null check (coins > 0),
  received_at timestamptz not null default now()
);

alter table public.iap_coin_events enable row level security;
revoke all on public.iap_coin_events from anon, authenticated;

create or replace function public.credit_listener_coins_from_iap(
  p_event_id text,
  p_transaction_id text,
  p_user_id uuid,
  p_product_id text,
  p_coins integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  order_id uuid;
begin
  if p_event_id = '' or p_transaction_id = '' or p_coins not in (50, 100, 200) then
    raise exception 'Invalid in-app purchase';
  end if;

  insert into public.iap_coin_events (event_id, transaction_id, user_id, product_id, coins)
  values (p_event_id, p_transaction_id, p_user_id, p_product_id, p_coins)
  on conflict do nothing;
  if not found then
    return false;
  end if;

  insert into public.payment_orders (
    kind, listener_user_id, amount_cents, coins_purchased, status, paid_at,
    wipay_transaction_id
  )
  values (
    'coin_purchase', p_user_id, p_coins * 10, p_coins, 'paid', now(),
    'iap:' || p_transaction_id
  )
  returning payment_orders.order_id into order_id;

  insert into public.listener_coin_wallets (user_id, balance_coins)
  values (p_user_id, p_coins)
  on conflict (user_id) do update
  set balance_coins = public.listener_coin_wallets.balance_coins + excluded.balance_coins,
      updated_at = now();

  insert into public.listener_coin_ledger (user_id, order_id, coins_delta)
  values (p_user_id, order_id, p_coins);
  return true;
end;
$$;

revoke all on function public.credit_listener_coins_from_iap(text, text, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.credit_listener_coins_from_iap(text, text, uuid, text, integer) to service_role;

notify pgrst, 'reload schema';
