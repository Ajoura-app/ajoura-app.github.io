-- AJOURA Plus: käyttöoikeudet ja tekoälyn kuukausikiintiö (Supabase-projekti sjamwwcqrwspwvilurqn).
-- Supabasen GitHub-yhteys ajaa tämän tiedoston tuotantoon, kun se tulee main-haaraan. Ajo on toistettavissa
-- (if not exists / or replace), joten käsin SQL Editorissa ajettu kopio ei riko myöhempää automaattista ajoa.
--
-- Turvallisuus: selain ei voi lukea eikä muuttaa tauluja suoraan (RLS päällä, ei käytäntöjä, oikeudet poistettu).
-- Kirjautunut käyttäjä saa vain oman tilansa funktiolla get_entitlement(). Kiintiön kulutus (ai_reserve, ai_release)
-- on vain palvelimen (service_role, eli tekoälyfunktion) käytössä. Tilauksia kirjoittaa vain palvelin tai ylläpito.

-- Tilaus: yksi rivi käyttäjää kohden. Ei riviä = Free.
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'plus')),
  status text not null default 'active' check (status in ('active', 'canceled', 'expired', 'past_due')),
  valid_until timestamptz,
  source text not null default 'manual' check (source in ('manual', 'stripe', 'apple', 'google')),
  external_id text,
  updated_at timestamptz not null default now()
);

-- Paketin tekoälykiintiö kuukaudessa. null = ei rajaa. Lopullisia rajoja ei ole päätetty: Plussan 30 on väliaikainen
-- kustannusraja, joka suojaa, kunnes raja päätetään. Muutos: update public.plan_limits set ai_monthly_limit = … where plan = 'plus';
create table if not exists public.plan_limits (
  plan text primary key check (plan in ('free', 'plus')),
  ai_monthly_limit integer check (ai_monthly_limit is null or ai_monthly_limit >= 0)
);
insert into public.plan_limits (plan, ai_monthly_limit) values ('free', 0), ('plus', 30) on conflict (plan) do nothing;

-- Tekoälyn käyttö kuukausittain (period = kuukauden ensimmäinen päivä, UTC).
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  period date not null,
  used integer not null default 0 check (used >= 0),
  primary key (user_id, period)
);

alter table public.subscriptions enable row level security;
alter table public.plan_limits enable row level security;
alter table public.ai_usage enable row level security;
revoke all on public.subscriptions, public.plan_limits, public.ai_usage from anon, authenticated;

-- Voimassa oleva Plus palvelimen kellolla: tila active ja voimassaolo ei ole päättynyt.
create or replace function public.ajoura_active_plan(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.plan from public.subscriptions s
                   where s.user_id = p_user and s.plan = 'plus' and s.status = 'active'
                     and s.valid_until is not null and s.valid_until > now()), 'free');
$$;

-- Sovellus (access.js) kysyy tämän: GET /rest/v1/rpc/get_entitlement käyttäjän istuntotunnisteella.
create or replace function public.get_entitlement() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
  v_until timestamptz;
  v_status text;
  v_limit integer;
  v_used integer;
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
begin
  if v_user is null then
    return jsonb_build_object('plan', 'free', 'status', 'none');
  end if;
  v_plan := public.ajoura_active_plan(v_user);
  if v_plan <> 'plus' then
    select case when s.status = 'active' and s.plan = 'plus' then 'expired' else s.status end into v_status
      from public.subscriptions s where s.user_id = v_user;
    return jsonb_build_object('plan', 'free', 'status', coalesce(v_status, 'none'));
  end if;
  select s.valid_until into v_until from public.subscriptions s where s.user_id = v_user;
  select l.ai_monthly_limit into v_limit from public.plan_limits l where l.plan = v_plan;
  select u.used into v_used from public.ai_usage u where u.user_id = v_user and u.period = v_period;
  return jsonb_build_object(
    'plan', v_plan,
    'status', 'active',
    'validUntil', to_char(v_until at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'quota', jsonb_build_object('ai', jsonb_build_object(
      'limit', v_limit,
      'used', coalesce(v_used, 0),
      'resetsAt', to_char((v_period + interval '1 month')::date, 'YYYY-MM-DD"T00:00:00Z"'))));
end;
$$;

-- Tekoälyfunktio varaa yhden tunnistuksen ennen kuin kuva lähetetään tekoälylle. Varaus on atominen: kaksi
-- samanaikaista pyyntöä eivät voi ylittää kiintiötä. Palauttaa {ok, reason} (reason: plan = ei Plussaa, quota = täynnä).
create or replace function public.ai_reserve(p_user uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_plan text := public.ajoura_active_plan(p_user);
  v_limit integer;
  v_used integer;
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
begin
  if v_plan <> 'plus' then
    return jsonb_build_object('ok', false, 'reason', 'plan');
  end if;
  select l.ai_monthly_limit into v_limit from public.plan_limits l where l.plan = v_plan;
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

-- Varauksen palautus, kun tunnistus epäonnistui (käyttäjältä ei kulu kiintiötä palvelimen virheestä).
create or replace function public.ai_release(p_user uuid, p_period date) returns void
language sql volatile security definer set search_path = '' as $$
  update public.ai_usage u set used = greatest(u.used - 1, 0) where u.user_id = p_user and u.period = p_period;
$$;

-- Supabase antaa uusille funktioille oletuksena suoritusoikeuden kaikille: rajataan.
revoke all on function public.ajoura_active_plan(uuid) from public, anon, authenticated;
revoke all on function public.get_entitlement() from public, anon, authenticated;
revoke all on function public.ai_reserve(uuid) from public, anon, authenticated;
revoke all on function public.ai_release(uuid, date) from public, anon, authenticated;
grant execute on function public.get_entitlement() to authenticated;
grant execute on function public.ajoura_active_plan(uuid), public.ai_reserve(uuid), public.ai_release(uuid, date) to service_role;
