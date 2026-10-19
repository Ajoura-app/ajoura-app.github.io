-- AJOURA account sync: one row per signed-in user holding their garage (cars, entries, fill-ups, notes).
-- Run once in Supabase: SQL Editor -> New query -> paste this -> Run.
-- Row level security: a user can only read and change their own row. The publishable key in sync.js
-- cannot reach anyone else's data.

create table if not exists public.garages (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  rev integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint garages_size check (octet_length(data::text) < 2000000)
);

alter table public.garages enable row level security;

drop policy if exists "garages_select_own" on public.garages;
drop policy if exists "garages_insert_own" on public.garages;
drop policy if exists "garages_update_own" on public.garages;
drop policy if exists "garages_delete_own" on public.garages;

create policy "garages_select_own" on public.garages for select to authenticated using ((select auth.uid()) = user_id);
create policy "garages_insert_own" on public.garages for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "garages_update_own" on public.garages for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "garages_delete_own" on public.garages for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.garages from anon;
grant select, insert, update, delete on public.garages to authenticated;
