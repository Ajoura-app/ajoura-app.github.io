-- Migraatioiden testi (ajetaan testit/test_supabase.py:stä paikallisessa PostgreSQL:ssä kaikkien migraatioiden
-- jälkeen). Jokainen tarkistus keskeyttää ajon virheeseen, jos tulos on väärä.
\set ON_ERROR_STOP on
insert into auth.users values
  ('00000000-0000-0000-0000-000000000001', 'free@esimerkki.test'),
  ('00000000-0000-0000-0000-000000000002', 'plus@esimerkki.test'),
  ('00000000-0000-0000-0000-000000000003', 'vanhentunut@esimerkki.test'),
  ('00000000-0000-0000-0000-000000000004', 'peruttu@esimerkki.test'),
  ('00000000-0000-0000-0000-000000000005', 'poistuva@esimerkki.test');
insert into public.subscriptions (user_id, plan, status, valid_until) values
  ('00000000-0000-0000-0000-000000000002', 'plus', 'active', now() + interval '30 days'),
  ('00000000-0000-0000-0000-000000000003', 'plus', 'active', now() - interval '1 second'),
  ('00000000-0000-0000-0000-000000000004', 'plus', 'canceled', now() + interval '30 days'),
  ('00000000-0000-0000-0000-000000000005', 'plus', 'active', now() + interval '30 days');

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
create function pg_temp.kayttaja(id text) returns void language sql as $$ select set_config('request.jwt.claim.sub', id, false) $$;
create function pg_temp.ilman(j jsonb) returns jsonb language sql as $$
  select (j - 'quota') || jsonb_build_object('quota', (j -> 'quota' -> 'ai') - 'resetsAt') $$;

-- ---- Oikeudet: Plus ja testivaiheen free (kirjautunut) ------------------------------------------------
set role authenticated;
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000002');
select pg_temp.odota('plus', pg_temp.ilman(get_entitlement()) - 'validUntil',
  '{"plan":"plus","status":"active","features":["ai.receipt","ai.pump","ai.odometer","ai.servicebook"],"quota":{"limit":30,"used":0}}');
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000001');
select pg_temp.odota('free (testivaihe)', pg_temp.ilman(get_entitlement()),
  '{"plan":"free","status":"active","validUntil":null,"features":["ai.receipt","ai.pump","ai.odometer","ai.servicebook"],"quota":{"limit":10,"used":0}}');
-- Vanhentunut tai peruttu Plus = free.
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000003');
select pg_temp.odota('vanhentunut', get_entitlement() -> 'plan', '"free"');
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000004');
select pg_temp.odota('peruttu', get_entitlement() -> 'plan', '"free"');
-- Selain ei pääse tilaus-, raja- tai käyttötauluihin eikä kiintiöfunktioihin.
select pg_temp.kielletty('lue tilaukset', 'select * from public.subscriptions');
select pg_temp.kielletty('anna itselle plus', $q$insert into public.subscriptions (user_id, plan, status, valid_until) values ('00000000-0000-0000-0000-000000000001', 'plus', 'active', now() + interval '1 year')$q$);
select pg_temp.kielletty('jatka omaa tilausta', $q$update public.subscriptions set valid_until = now() + interval '10 years'$q$);
select pg_temp.kielletty('nollaa käyttö', 'delete from public.ai_usage');
select pg_temp.kielletty('muuta rajaa', 'update public.plan_limits set ai_monthly_limit = null');
select pg_temp.kielletty('varaa itse', $q$select public.ai_reserve('00000000-0000-0000-0000-000000000002')$q$);
select pg_temp.kielletty('palauta itse', $q$select public.ai_release('00000000-0000-0000-0000-000000000002', current_date)$q$);
select pg_temp.kielletty('kysy toisen paketti', $q$select public.ajoura_active_plan('00000000-0000-0000-0000-000000000002')$q$);
reset role;
set role anon;
select pg_temp.kielletty('anon: oikeus', 'select public.get_entitlement()');
select pg_temp.kielletty('anon: tallit', 'select * from public.garages');
select pg_temp.kielletty('anon: tilin poisto', 'select public.delete_my_account()');

-- ---- Kiintiö (palvelin) ------------------------------------------------------------------------------
reset role;
set role service_role;
select public.ai_reserve('00000000-0000-0000-0000-000000000001') from generate_series(1, 9);
select pg_temp.odota('free 10.', public.ai_reserve('00000000-0000-0000-0000-000000000001') - 'period', '{"ok":true,"used":10,"limit":10}');
select pg_temp.odota('free 11.', public.ai_reserve('00000000-0000-0000-0000-000000000001'), '{"ok":false,"reason":"quota","limit":10}');
select public.ai_reserve('00000000-0000-0000-0000-000000000002') from generate_series(1, 29);
select pg_temp.odota('plus 30.', public.ai_reserve('00000000-0000-0000-0000-000000000002') - 'period', '{"ok":true,"used":30,"limit":30}');
select pg_temp.odota('plus 31.', public.ai_reserve('00000000-0000-0000-0000-000000000002'), '{"ok":false,"reason":"quota","limit":30}');
select public.ai_release('00000000-0000-0000-0000-000000000002', date_trunc('month', now() at time zone 'utc')::date);
select pg_temp.odota('palautuksen jälkeen', public.ai_reserve('00000000-0000-0000-0000-000000000002') - 'period', '{"ok":true,"used":30,"limit":30}');
select pg_temp.odota('tuntematon käyttäjä', public.ai_reserve('00000000-0000-0000-0000-0000000000ff'), '{"ok":false,"reason":"plan"}');

-- Maksujen tultua: free ilman tekoälyä yhdellä päivityksellä; Plus ennallaan.
reset role;
update public.plan_limits set ai_enabled = false where plan = 'free';
set role service_role;
select pg_temp.odota('free ilman tekoälyä', public.ai_reserve('00000000-0000-0000-0000-000000000004'), '{"ok":false,"reason":"plan"}');
reset role;
set role authenticated;
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000004');
select pg_temp.odota('free ilman tekoälyä: oikeus', get_entitlement() -> 'features', '[]');
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000002');
select pg_temp.odota('plus yhä', get_entitlement() -> 'features', '["ai.receipt","ai.pump","ai.odometer","ai.servicebook"]');
reset role;
update public.plan_limits set ai_enabled = true where plan = 'free';

-- ---- Pilvitalli: jokainen näkee ja muuttaa vain omaansa -----------------------------------------------
set role authenticated;
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000001');
insert into public.garages (user_id, data) values ('00000000-0000-0000-0000-000000000001', '{"cars":[{"id":"a"}]}');
select pg_temp.kielletty('talli toiselle', $q$insert into public.garages (user_id, data) values ('00000000-0000-0000-0000-000000000002', '{"cars":[]}')$q$);
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000002');
select pg_temp.odota('toisen talli ei näy', (select to_jsonb(count(*)) from public.garages), '0');
update public.garages set data = '{"hakkeroitu":true}';
delete from public.garages;
insert into public.garages (user_id, data) values ('00000000-0000-0000-0000-000000000002', '{"cars":[{"id":"b"}]}');
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000001');
select pg_temp.odota('oma talli koskematon', (select data from public.garages), '{"cars":[{"id":"a"}]}');
do $$ begin
  update public.garages set data = jsonb_build_object('x', repeat('a', 2100000));
  raise exception 'VIRHE liian suuri talli hyväksyttiin';
exception when check_violation then null;
end $$;

-- ---- Tilin poisto: vain oma tili, ja pilvitalli, tilaus ja käyttö poistuvat ---------------------------
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000005');
insert into public.garages (user_id, data) values ('00000000-0000-0000-0000-000000000005', '{"cars":[]}');
select public.delete_my_account();
reset role;
select pg_temp.odota('poistettu käyttäjä', (select to_jsonb(count(*)) from auth.users where id = '00000000-0000-0000-0000-000000000005'), '0');
select pg_temp.odota('poistetun talli', (select to_jsonb(count(*)) from public.garages where user_id = '00000000-0000-0000-0000-000000000005'), '0');
select pg_temp.odota('poistetun tilaus', (select to_jsonb(count(*)) from public.subscriptions where user_id = '00000000-0000-0000-0000-000000000005'), '0');
select pg_temp.odota('muut tilit ennallaan', (select to_jsonb(count(*)) from auth.users), '4');

-- ---- Jaettu talli (0.117) ----------------------------------------------------------------------------
insert into auth.users values
  ('00000000-0000-0000-0000-000000000011', 'omistaja@esimerkki.test'),
  ('00000000-0000-0000-0000-000000000012', 'puoliso@esimerkki.test'),
  ('00000000-0000-0000-0000-000000000013', 'ulkopuolinen@esimerkki.test'),
  ('00000000-0000-0000-0000-000000000014', 'toinen-omistaja@esimerkki.test');
create temp table kutsut (nimi text primary key, token text);
grant all on kutsut to authenticated;
set role authenticated;
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000011');
insert into public.garages (user_id, data) values ('00000000-0000-0000-0000-000000000011', '{"cars":[{"id":"omistajan"}]}');
insert into kutsut select 'a', public.create_invite() ->> 'token';
insert into kutsut select 'b', public.create_invite() ->> 'token';
insert into kutsut select 'vanha', public.create_invite() ->> 'token';
select pg_temp.odota('oma kutsu', public.accept_invite((select token from kutsut where nimi = 'a')), '{"ok":false,"reason":"own"}');
select pg_temp.kielletty('kutsut eivät näy', 'select * from public.garage_invites');
select pg_temp.kielletty('jäsenet eivät näy', 'select * from public.garage_members');
reset role;
update public.garage_invites set expires_at = now() - interval '1 second'
  where token_hash = encode(extensions.digest((select token from kutsut where nimi = 'vanha'), 'sha256'), 'hex');
select pg_temp.odota('vain tiiviste tallessa', (select to_jsonb(count(*)) from public.garage_invites where token_hash = (select token from kutsut where nimi = 'a')), '0');
set role authenticated;
-- Puolisolla on oma talli; liittyessä se poistuu pilvestä (sovellus on yhdistänyt sen laitteelle).
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000012');
insert into public.garages (user_id, data) values ('00000000-0000-0000-0000-000000000012', '{"cars":[{"id":"puolison"}]}');
select pg_temp.odota('vanhentunut kutsu', public.accept_invite((select token from kutsut where nimi = 'vanha')), '{"ok":false,"reason":"invalid"}');
select pg_temp.odota('keksitty kutsu', public.accept_invite('arvattu'), '{"ok":false,"reason":"invalid"}');
select pg_temp.odota('liittyminen', public.accept_invite((select token from kutsut where nimi = 'a')) - 'owner', '{"ok":true}');
select pg_temp.odota('jäsenen näkymä', public.my_garage() - 'owner', '{"role":"member","owner_email":"omistaja@esimerkki.test"}');
select pg_temp.odota('jäsen näkee tallin', (select data from public.garages), '{"cars":[{"id":"omistajan"}]}');
update public.garages set data = '{"cars":[{"id":"omistajan"},{"id":"puolison"}]}', rev = rev + 1;
select pg_temp.odota('jäsen muokkasi', (select data from public.garages where user_id = '00000000-0000-0000-0000-000000000011'), '{"cars":[{"id":"omistajan"},{"id":"puolison"}]}');
select pg_temp.kielletty('jäsen ei luo riviä omistajalle', $q$insert into public.garages (user_id, data) values ('00000000-0000-0000-0000-000000000011', '{}')$q$);
delete from public.garages;
select pg_temp.odota('jäsen ei poista tallia', (select to_jsonb(count(*)) from public.garages), '1');
select pg_temp.odota('käytetty kutsu', public.accept_invite((select token from kutsut where nimi = 'a')), '{"ok":false,"reason":"invalid"}');
select pg_temp.odota('jo jäsen', public.accept_invite((select token from kutsut where nimi = 'b')), '{"ok":false,"reason":"already_member"}');
do $$ begin perform public.create_invite(); raise exception 'VIRHE jäsen loi kutsun'; exception when insufficient_privilege then null; end $$;
select public.remove_member('00000000-0000-0000-0000-000000000012');
select pg_temp.odota('jäsen ei poista jäseniä', (select to_jsonb(count(*)) from public.garages), '1');
-- Ulkopuolinen ei näe tallia eikä voi käyttää käytettyä kutsua.
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000013');
select pg_temp.odota('ulkopuolinen ei näe', (select to_jsonb(count(*)) from public.garages where user_id = '00000000-0000-0000-0000-000000000011'), '0');
select pg_temp.odota('käytetty kutsu toiselle', public.accept_invite((select token from kutsut where nimi = 'a')), '{"ok":false,"reason":"invalid"}');
update public.garages set data = '{"hakkeroitu":true}' where user_id = '00000000-0000-0000-0000-000000000011';
-- Omistajan näkymä ja jäsenen poisto.
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000011');
select pg_temp.odota('omistajan näkymä', (select jsonb_agg(x - 'joined' - 'id') from jsonb_array_elements(public.my_garage() -> 'members') x), '[{"email":"puoliso@esimerkki.test"}]');
select pg_temp.odota('ulkopuolinen ei muuttanut', (select data from public.garages), '{"cars":[{"id":"omistajan"},{"id":"puolison"}]}');
select public.remove_member('00000000-0000-0000-0000-000000000012');
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000012');
select pg_temp.odota('poistettu jäsen ei näe', (select to_jsonb(count(*)) from public.garages), '0');
select pg_temp.odota('poistettu jäsen on taas omistaja', public.my_garage() -> 'role', '"owner"');
-- Uudelleen liittyminen toisella kutsulla ja poistuminen itse.
select pg_temp.odota('uusi liittyminen', public.accept_invite((select token from kutsut where nimi = 'b')) - 'owner', '{"ok":true}');
select public.leave_garage();
select pg_temp.odota('poistunut ei näe', (select to_jsonb(count(*)) from public.garages), '0');
-- Omaa talliaan jakava ei voi liittyä toiseen talliin.
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000014');
insert into kutsut select 'c', public.create_invite() ->> 'token';
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000013');
select pg_temp.odota('liittyminen 2', public.accept_invite((select token from kutsut where nimi = 'c')) - 'owner', '{"ok":true}');
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000011');
insert into kutsut select 'd', public.create_invite() ->> 'token';
select pg_temp.kayttaja('00000000-0000-0000-0000-000000000014');
select pg_temp.odota('jakaja ei liity', public.accept_invite((select token from kutsut where nimi = 'd')), '{"ok":false,"reason":"has_members"}');
reset role;
set role anon;
select pg_temp.kielletty('anon: kutsu', 'select public.create_invite()');
select pg_temp.kielletty('anon: liittyminen', $q$select public.accept_invite('x')$q$);
reset role;
-- Omistajan tilin poisto lopettaa jäsenyydet.
delete from auth.users where id = '00000000-0000-0000-0000-000000000014';
select pg_temp.odota('omistajan poisto', (select to_jsonb(count(*)) from public.garage_members where member_id = '00000000-0000-0000-0000-000000000013'), '0');
select 'KAIKKI TARKISTUKSET OK';
