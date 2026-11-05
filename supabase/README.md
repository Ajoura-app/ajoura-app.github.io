# AJOURA Plus -taustapalvelu (Supabase)

Projekti `sjamwwcqrwspwvilurqn` (https://sjamwwcqrwspwvilurqn.supabase.co). Supabasen GitHub-yhteys ottaa main-haaran
muutokset käyttöön automaattisesti (Deploy to production): uudet tiedostot kansiossa `migrations/` ajetaan
tietokantaan ja `config.toml`:ssä luetellut funktiot julkaistaan. Muita asetuksia (kirjautuminen, sähköpostit) ei
viedä täältä, vaan ne tehdään Supabasen hallinnassa.

| Kansio | Sisältö |
|---|---|
| `migrations/` | Tietokanta: tilaukset (`subscriptions`), pakettien kiintiöt (`plan_limits`), kuukausikäyttö (`ai_usage`), funktiot `get_entitlement`, `ai_reserve`, `ai_release` |
| `functions/tekoaly/` | Tekoälytunnistuksen palvelin: tarkistaa käyttäjän, Plus-tilauksen ja kiintiön jokaisessa pyynnössä |
| `testit/` | Testit (ajetaan `python3 -m pytest testit/test_supabase.py` repon juuresta) |
| `garages.sql` | Vanhan, käytöstä poistetun synkronoinnin taulu (vanha projekti). Ei käytössä. |

## Säännöt
- Salaisia avaimia (`sb_secret_…`, `service_role`, `sbp_…`) ei koskaan tähän repoon. Julkinen avain (`sb_publishable_…`)
  saa olla sovelluksessa.
- Uusi migraatio on uusi tiedosto (aikaleima nimessä). Julkaistua tiedostoa ei muuteta.
- Jokainen taulu suojataan RLS:llä ja jokaisen funktion suoritusoikeus rajataan (`revoke … from public, anon, authenticated`).

## Ylläpito (Supabase → SQL Editor)

Plus testaajalle 30 päiväksi (käyttäjä syntyy ensimmäisestä kirjautumisesta):

```sql
insert into public.subscriptions (user_id, plan, status, valid_until, source)
select id, 'plus', 'active', now() + interval '30 days', 'manual' from auth.users where email = 'testaaja@esimerkki.fi'
on conflict (user_id) do update set plan = 'plus', status = 'active', valid_until = excluded.valid_until, updated_at = now();
```

Plus pois: `update public.subscriptions set status = 'canceled', updated_at = now() where user_id = (select id from auth.users where email = 'testaaja@esimerkki.fi');`

Kuukausikiintiö (nyt väliaikainen 30): `update public.plan_limits set ai_monthly_limit = 30 where plan = 'plus';` (null = ei rajaa)
