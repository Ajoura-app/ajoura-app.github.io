-- AJOURA: pilvitallennus, tekoäly testivaiheessa ilman Plussaa ja tilin poisto (v0.116). Toistettavissa.
--
-- 1. garages: kirjautuneen käyttäjän talli (autot, merkinnät, tankkaukset, muistiinpanot; ei kuvia eikä kuitteja).
--    Rivitason suojaus: jokainen näkee ja muuttaa vain omaa riviään. Sovellus synkronoi sen (sync.js).
-- 2. plan_limits.ai_enabled: saako paketti tekoälyn. Testivaiheessa myös free (kirjautunut käyttäjä) saa sen,
--    10 tunnistusta kuukaudessa. Kun maksut tulevat: update public.plan_limits set ai_enabled = false where plan = 'free';
--    Sovellus lukee luvan palvelimelta (get_entitlement → features), joten sovellukseen ei tarvita muutosta.
-- 3. delete_my_account(): käyttäjä poistaa oman tilinsä; tilaus, käyttö ja pilvitalli poistuvat samalla (cascade).

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
revoke all on public.garages from authenticated;
grant select, insert, update, delete on public.garages to authenticated;

alter table public.plan_limits add column if not exists ai_enabled boolean not null default false;
update public.plan_limits set ai_enabled = true, ai_monthly_limit = 10 where plan = 'free';
update public.plan_limits set ai_enabled = true where plan = 'plus';

-- Käyttäjän paketti ja sen sallimat ominaisuudet. Kirjautumaton (anon) ei voi kutsua tätä.
create or replace function public.get_entitlement() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
  v_until timestamptz;
  v_ai boolean;
  v_limit integer;
  v_used integer;
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
begin
  if v_user is null then
    return jsonb_build_object('plan', 'free', 'status', 'none', 'features', '[]'::jsonb);
  end if;
  v_plan := public.ajoura_active_plan(v_user);
  if v_plan = 'plus' then
    select s.valid_until into v_until from public.subscriptions s where s.user_id = v_user;
  end if;
  select l.ai_enabled, l.ai_monthly_limit into v_ai, v_limit from public.plan_limits l where l.plan = v_plan;
  select u.used into v_used from public.ai_usage u where u.user_id = v_user and u.period = v_period;
  return jsonb_build_object(
    'plan', v_plan,
    'status', 'active',
    'validUntil', case when v_until is null then null else to_char(v_until at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
    'features', case when coalesce(v_ai, false) then '["ai.receipt","ai.odometer","ai.servicebook"]'::jsonb else '[]'::jsonb end,
    'quota', jsonb_build_object('ai', jsonb_build_object(
      'limit', v_limit,
      'used', coalesce(v_used, 0),
      'resetsAt', to_char((v_period + interval '1 month')::date, 'YYYY-MM-DD"T00:00:00Z"'))));
end;
$$;

-- Varaus: paketin pitää sallia tekoäly (ai_enabled), ja kiintiötä pitää olla jäljellä.
create or replace function public.ai_reserve(p_user uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_plan text := public.ajoura_active_plan(p_user);
  v_ai boolean;
  v_limit integer;
  v_used integer;
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
begin
  if not exists (select 1 from auth.users where id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'plan');
  end if;
  select l.ai_enabled, l.ai_monthly_limit into v_ai, v_limit from public.plan_limits l where l.plan = v_plan;
  if not coalesce(v_ai, false) then
    return jsonb_build_object('ok', false, 'reason', 'plan');
  end if;
  insert into public.ai_usage (user_id, period, used) values (p_user, v_period, 0) on conflict do nothing;
  update public.ai_usage u set used = u.used + 1
    where u.user_id = p_user and u.period = v_period and (v_limit is null or u.used < v_limit)
    returning u.used into v_used;
  if v_used is null then
    return jsonb_build_object('ok', false, 'reason', 'quota', 'limit', v_limit);
  end if;
  return jsonb_build_object('ok', true, 'period', v_period, 'used', v_used, 'limit', v_limit);
end;
$$;

-- Tilin poisto: vain oma tili. Poistaa käyttäjän, ja cascade poistaa pilvitallin, tilauksen ja käytön.
create or replace function public.delete_my_account() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from auth.users where id = v_user;
end;
$$;

revoke all on function public.get_entitlement() from public, anon, authenticated;
revoke all on function public.ai_reserve(uuid) from public, anon, authenticated;
revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.get_entitlement() to authenticated;
grant execute on function public.ai_reserve(uuid) to service_role;
grant execute on function public.delete_my_account() to authenticated;
