-- Migraation testi (ajetaan testit/test_supabase.py:stä paikallisessa PostgreSQL:ssä). Jokainen tarkistus
-- keskeyttää ajon virheeseen, jos tulos on väärä.
\set ON_ERROR_STOP on
insert into auth.users values
  ('00000000-0000-0000-0000-000000000001', 'free@esimerkki.test'),
  ('00000000-0000-0000-0000-000000000002', 'plus@esimerkki.test'),
  ('00000000-0000-0000-0000-000000000003', 'vanhentunut@esimerkki.test'),
  ('00000000-0000-0000-0000-000000000004', 'peruttu@esimerkki.test');
insert into public.subscriptions (user_id, plan, status, valid_until) values
  ('00000000-0000-0000-0000-000000000002', 'plus', 'active', now() + interval '30 days'),
  ('00000000-0000-0000-0000-000000000003', 'plus', 'active', now() - interval '1 second'),
  ('00000000-0000-0000-0000-000000000004', 'plus', 'canceled', now() + interval '30 days');

create function pg_temp.odota(nimi text, saatu jsonb, odotettu jsonb) returns void language plpgsql as $$
begin
  if saatu is distinct from odotettu then raise exception 'VIRHE %: saatiin %, odotettiin %', nimi, saatu, odotettu; end if;
end $$;
create function pg_temp.kielletty(nimi text, kysely text) returns void language plpgsql as $$
begin
  execute kysely;
  raise exception 'VIRHE %: kysely onnistui, vaikka sen pitäisi olla kielletty: %', nimi, kysely;
exception when insufficient_privilege then null;
end $$;

-- Kirjautunut Plus-käyttäjä näkee oman tilansa ja kiintiön.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select pg_temp.odota('plus: paketti', (select get_entitlement() - 'validUntil' - 'quota'), '{"plan":"plus","status":"active"}');
select pg_temp.odota('plus: kiintiö', ((get_entitlement() -> 'quota' -> 'ai') - 'resetsAt'), '{"limit":30,"used":0}');
-- Selain ei pääse tauluihin eikä kiintiöfunktioihin, ei myöskään omiin riveihinsä.
select pg_temp.kielletty('lue tilaukset', 'select * from public.subscriptions');
select pg_temp.kielletty('anna itselle plus', $q$insert into public.subscriptions (user_id, plan, status, valid_until) values ('00000000-0000-0000-0000-000000000001', 'plus', 'active', now() + interval '1 year')$q$);
select pg_temp.kielletty('jatka omaa tilausta', $q$update public.subscriptions set valid_until = now() + interval '10 years'$q$);
select pg_temp.kielletty('nollaa käyttö', 'delete from public.ai_usage');
select pg_temp.kielletty('muuta rajaa', 'update public.plan_limits set ai_monthly_limit = null');
select pg_temp.kielletty('varaa itse', $q$select public.ai_reserve('00000000-0000-0000-0000-000000000002')$q$);
select pg_temp.kielletty('palauta itse', $q$select public.ai_release('00000000-0000-0000-0000-000000000002', current_date)$q$);
select pg_temp.kielletty('kysy toisen paketti', $q$select public.ajoura_active_plan('00000000-0000-0000-0000-000000000002')$q$);

-- Free, vanhentunut ja peruttu tilaus: Free.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select pg_temp.odota('free', get_entitlement(), '{"plan":"free","status":"none"}');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select pg_temp.odota('vanhentunut', get_entitlement(), '{"plan":"free","status":"expired"}');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
select pg_temp.odota('peruttu', get_entitlement(), '{"plan":"free","status":"canceled"}');
-- Ilman kirjautumista (anon) funktio ei ole käytettävissä lainkaan.
reset role;
set role anon;
select pg_temp.kielletty('anon', 'select public.get_entitlement()');

-- Palvelin (tekoälyfunktio): varaus vain Plussalle ja enintään kiintiön verran; palautus vapauttaa yhden.
reset role;
set role service_role;
select pg_temp.odota('varaus free', public.ai_reserve('00000000-0000-0000-0000-000000000001'), '{"ok":false,"reason":"plan"}');
select pg_temp.odota('varaus vanhentunut', public.ai_reserve('00000000-0000-0000-0000-000000000003'), '{"ok":false,"reason":"plan"}');
select pg_temp.odota('varaus peruttu', public.ai_reserve('00000000-0000-0000-0000-000000000004'), '{"ok":false,"reason":"plan"}');
select public.ai_reserve('00000000-0000-0000-0000-000000000002') from generate_series(1, 29);
select pg_temp.odota('30. varaus', public.ai_reserve('00000000-0000-0000-0000-000000000002') - 'period', '{"ok":true,"used":30,"limit":30}');
select pg_temp.odota('31. varaus', public.ai_reserve('00000000-0000-0000-0000-000000000002'), '{"ok":false,"reason":"quota","limit":30}');
select public.ai_release('00000000-0000-0000-0000-000000000002', date_trunc('month', now() at time zone 'utc')::date);
select pg_temp.odota('varaus palautuksen jälkeen', public.ai_reserve('00000000-0000-0000-0000-000000000002') - 'period', '{"ok":true,"used":30,"limit":30}');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select pg_temp.odota('käyttö näkyy', ((get_entitlement() -> 'quota' -> 'ai') - 'resetsAt'), '{"limit":30,"used":30}');
reset role;
select 'KAIKKI TARKISTUKSET OK';
