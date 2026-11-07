-- AJOURA: testivaiheen tekoälykiintiö kirjautuneelle free-käyttäjälle 10 → 30 tunnistusta kuukaudessa (Niklas 7.11.2026).
-- Syy: tankkaukset kirjataan jatkossa ensisijaisesti tekoälyllä (Täytä kuvasta, myöhemmin tekoälytila), ja yksi tankkaus voi
-- viedä kaksi tunnistusta. Kustannusarvio enintään noin 30 × 0,0004 $ = 0,012 $ käyttäjää kohti kuukaudessa. Plussan raja on
-- jo 30. Toistettavissa. Kun maksut tulevat: update public.plan_limits set ai_enabled = false where plan = 'free';
update public.plan_limits set ai_monthly_limit = 30 where plan = 'free';
