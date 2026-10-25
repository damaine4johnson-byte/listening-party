-- Paid entry rooms (Tier 2+). Run once on an existing project.
alter table public.rooms
  add column if not exists entry_fee_cents integer not null default 0
  check (entry_fee_cents = 0 or entry_fee_cents between 100 and 100000);

notify pgrst, 'reload schema';
