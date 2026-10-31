-- Adds link-in-bio to artist profiles (shown on the public artist page).
alter table public.host_profiles add column if not exists link_in_bio text not null default '' check (char_length(link_in_bio) <= 300);
