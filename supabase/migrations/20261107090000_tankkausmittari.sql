-- AJOURA 1.19: tankkausmittarin tunnistus (ai.pump) tekoälyominaisuuksien joukkoon. Toistettavissa.
--
-- Sovellus (access.js) lukee sallitut ominaisuudet funktiosta get_entitlement(). Tekoälyn lupa on edelleen yksi
-- (plan_limits.ai_enabled) ja kiintiö yksi yhteinen (ai_usage), joten tämä vain lisää uuden nimen palautettavaan listaan:
-- kuitti, tankkausmittari, auton mittaristo ja huoltokirja. Muuta funktio ei muutu (edellinen: 20261106120000).

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
    'features', case when coalesce(v_ai, false) then '["ai.receipt","ai.pump","ai.odometer","ai.servicebook"]'::jsonb else '[]'::jsonb end,
    'quota', jsonb_build_object('ai', jsonb_build_object(
      'limit', v_limit,
      'used', coalesce(v_used, 0),
      'resetsAt', to_char((v_period + interval '1 month')::date, 'YYYY-MM-DD"T00:00:00Z"'))));
end;
$$;

revoke all on function public.get_entitlement() from public, anon, authenticated;
grant execute on function public.get_entitlement() to authenticated;
