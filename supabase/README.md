# AJOURA Plus -taustapalvelu (Supabase)

Projekti `sjamwwcqrwspwvilurqn` (https://sjamwwcqrwspwvilurqn.supabase.co). Supabasen GitHub-yhteys ottaa main-haaran
muutokset käyttöön automaattisesti: uudet tiedostot kansiossa `migrations/` ajetaan
tietokantaan ja `config.toml`:ssä luetellut funktiot julkaistaan. Muita asetuksia (kirjautuminen, sähköpostit) ei
viedä täältä, vaan ne tehdään Supabasen hallinnassa.

GitHub-yhteyden asetukset (Project Settings → Integrations → GitHub): repo `Ajoura-app/ajoura-app.github.io`, Working
directory `.`, Production branch `main`, Deploy to production päällä. Jos tuotantohaara puuttuu, Supabase ohittaa
julkaisun viestillä "This git branch is not associated with any Supabase Branch" (näkyy commitin tarkistuksissa).
Julkaisun tila: Supabase → Branches → main.

| Kansio | Sisältö |
|---|---|
| `migrations/` | Tietokanta: tilaukset (`subscriptions`), pakettien kiintiöt ja tekoälylupa (`plan_limits`), kuukausikäyttö (`ai_usage`), pilvitalli (`garages`, 0.116), funktiot `get_entitlement`, `ai_reserve`, `ai_release`, `delete_my_account` |
| `functions/tekoaly/` | Tekoälytunnistuksen palvelin: tarkistaa käyttäjän, Plus-tilauksen ja kiintiön jokaisessa pyynnössä ja lukee kuitin Claude Haiku 5.5:llä |
| `testit/` | Testit (ajetaan `python3 -m pytest testit/test_supabase.py` repon juuresta) |
| `garages.sql` | Vanhan projektin taulu (historiaa). Nykyinen taulu on migraatiossa 20261106120000. |

## Säännöt
- Salaisia avaimia (`sb_secret_…`, `service_role`, `sbp_…`) ei koskaan tähän repoon. Julkinen avain (`sb_publishable_…`)
  saa olla sovelluksessa.
- Uusi migraatio on uusi tiedosto (aikaleima nimessä). Julkaistua tiedostoa ei muuteta.
- Jokainen taulu suojataan RLS:llä ja jokaisen funktion suoritusoikeus rajataan (`revoke … from public, anon, authenticated`).

## Tekoäly (Anthropic, Claude Haiku 5.5)

Funktio `tekoaly` lukee Anthropicin API-avaimen Supabasen salaisuudesta `ANTHROPIC_API_KEY` (Edge Functions → Secrets).
Avainta ei koskaan laiteta tähän repoon eikä sovellukseen. Ilman avainta funktio vastaa 503 eikä mitään lähetetä.
Aseta Anthropicin konsolissa kuukausittainen käyttöraja (Settings → Limits), jotta kulu ei voi yllättää. Arvio:
noin 0,001 $ / kuitti (Haiku 5.5). Toteutettu: kuitti. Mittari ja huoltokirja vastaavat 501, kunnes ne tehdään.

## Kirjautuminen ja testivaihe (0.116)

Kirjautuminen on Google-tilillä (Authentication → Sign In / Providers → Google; Site URL ja Redirect URLs
`https://ajoura-app.github.io/app.html` ja `https://ajoura-app.github.io/**`). Kirjautuneen talli synkronoituu (sync.js).
Julkinen kirjautuminen pidetään toistaiseksi suljettuna: asetus "Salli uusien käyttäjien rekisteröityminen" (Authentication →
Sign In / Providers → User Signups) pitää olla pois päältä, jolloin vain jo luodut tilit pääsevät sisään. Testaajan lisäys:
kytke asetus hetkeksi päälle, testaaja kirjautuu kerran Googlella, kytke takaisin pois. Julkisessa julkaisussa asetus
kytketään päälle.
Testivaiheessa kirjautunut free saa tekoälyn 10 tunnistusta/kk. Kun maksut otetaan käyttöön:
`update public.plan_limits set ai_enabled = false where plan = 'free';` (sovellukseen ei tarvita muutosta).
Ilmainen taso: projekti pysähtyy viikon käyttämättömyyden jälkeen eikä ota varmuuskopioita. Ennen julkista versiota Pro.

## Jaettu talli (0.117)

Omistaja kutsuu jäseniä kertakäyttöisellä linkillä (`create_invite`, voimassa 7 pv, tallessa vain tiiviste). Jäsen
(`garage_members`) lukee ja päivittää omistajan riviä taulussa `garages` (rivitason suojaus `ajoura_is_member`).
Enintään 5 jäsentä ja 5 avointa kutsua. Liittyessä liittyjän oma pilvirivi poistetaan (sovellus on yhdistänyt sen).

## Ylläpito (Supabase → SQL Editor)

Plus testaajalle 30 päiväksi (käyttäjä syntyy ensimmäisestä kirjautumisesta):

```sql
insert into public.subscriptions (user_id, plan, status, valid_until, source)
select id, 'plus', 'active', now() + interval '30 days', 'manual' from auth.users where email = 'testaaja@esimerkki.fi'
on conflict (user_id) do update set plan = 'plus', status = 'active', valid_until = excluded.valid_until, updated_at = now();
```

Plus pois: `update public.subscriptions set status = 'canceled', updated_at = now() where user_id = (select id from auth.users where email = 'testaaja@esimerkki.fi');`

Kuukausikiintiö (nyt väliaikainen 30): `update public.plan_limits set ai_monthly_limit = 30 where plan = 'plus';` (null = ei rajaa)
