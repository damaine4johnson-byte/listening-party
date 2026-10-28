-- Lets hosts view their room's invite code again from inside the room. Run once.
alter table public.rooms add column if not exists invite_code text;

notify pgrst, 'reload schema';
