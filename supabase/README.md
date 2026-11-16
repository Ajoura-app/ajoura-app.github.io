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
Aseta Anthropicin konsolissa kuukausittainen käyttöraja (Billing → Spend limits), jotta kulu ei voi yllättää. Arvio:
noin 0,0004 $ / kuva (Haiku 5.5, oma arvio; vanha 0,001 $ on varma yläraja).
Toteutettu: `ai.receipt` = tankkausikkunan "Täytä kuvasta" (1.19): yksi kuva, jonka lajin tekoäly tunnistaa itse (kuitti,
tankkausmittarin näyttö tai auton mittaristo), yksi yhteinen kuukausikiintiö. Sama ominaisuus ottaa vastaan tekoälytilan tekstin
(1.20): runko `application/json` `{text, today}`, enintään 500 merkkiä, ja päivä enintään puolentoista vuorokauden päässä
palvelimen kellosta (muuten 400 ennen kiintiötä). `ai.odometer` ja `ai.servicebook` vastaavat 501,
kunnes ne tehdään. Uusi kuvalaji: lisää se `ai.receipt`-ohjeeseen ja skeemaan sekä `cleanPhoto`-funktioon; uusi
ominaisuusnimi (esim. oma painike) vaatii lisäksi `access.js`:n `FEATURES`-listan ja uuden migraation `get_entitlement`-funktioon.

## Kirjautuminen ja testivaihe (0.116)

Kirjautuminen on Google-tilillä (Authentication → Sign In / Providers → Google; Site URL ja Redirect URLs
`https://ajoura-app.github.io/app.html` ja `https://ajoura-app.github.io/**`). Kirjautuneen talli synkronoituu (sync.js).
Julkinen kirjautuminen pidetään toistaiseksi suljettuna: asetus "Salli uusien käyttäjien rekisteröityminen" (Authentication →
Sign In / Providers → User Signups) pitää olla pois päältä, jolloin vain jo luodut tilit pääsevät sisään. Testaajan lisäys:
kytke asetus hetkeksi päälle, testaaja kirjautuu kerran Googlella, kytke takaisin pois. Julkisessa julkaisussa asetus
kytketään päälle.
Testivaiheessa kirjautunut free saa tekoälyn 30 tunnistusta/kk (10 → 30 migraatiolla 20261107120000). Kun maksut otetaan käyttöön:
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


## Traccar Cloud: rajattu GPS-yhteystesti

`gps-traccar` on vain luku -Edge Function yhdelle testaajalle. Se kutsuu kiinteästi osoitteita
`https://server.traccar.org/api/devices` ja `/api/positions`.
Se palauttaa ainoastaan laitteiden lukumäärän, sijaintitiedon saatavuuden ja viimeisimmän GPS-päivityksen ajan.
Se **ei** palauta koordinaatteja, IMEI-tunnuksia, laitenimiä, Traccarin vastauksia eikä API-tokenia.
Se ei tallenna mitään tietokantaan eikä muuta Ajouran ajoneuvojen mittarilukemia.
GPS:n reitti- ja ajopäiväkirjatoiminnot tehdään erillisenä myöhempänä vaiheena.

### Edellytykset

1. Supabase Dashboard → Edge Functions → Secrets: `TRACCAR_API_TOKEN` on lyhytaikainen
   Traccarin käyttöoikeustunnus. **Älä koskaan tallenna sitä GitHubiin, selaimeen tai lokiin.**
2. Supabase Dashboard → Authentication → Users: hae omaa Ajoura-kirjautumista vastaava
   käyttäjän UUID (User ID). Lisää se Edge Functions → Secrets -kohtaan nimellä
   `TRACCAR_TEST_OWNER_ID`. Älä kopioi sähköpostiosoitetta tähän arvoon.
3. `SUPABASE_URL` ja Supabasen julkinen avain tulevat Supabasen omasta ympäristöstä.
   Funktion `verify_jwt = true`, ja se tarkistaa JWT:n lisäksi käyttäjän ID:n
   Supabase Authilta. Pelkkä publishable-avain ei anna käyttöoikeutta.

### Käyttöönotto ja testaus

- Muutokset valmistellaan erilliseen kehityshaaraan. Supabasen GitHub-integraatio julkaisee
  Edge Functionin, kun hyväksytty muutos yhdistetään tuotantohaaraan. **Älä yhdistä
  ennen käyttäjän julkaisuhyväksyntää.**
- Mockatut automaattiset testit: `python3 -m pytest testit/test_gps_traccar.py`.
  Testit eivät ota yhteyttä oikeaan Traccariin eivätkä tarvitse oikeaa tokenia.
- Julkaisun jälkeen tee `GET /functions/v1/gps-traccar` Ajouran kirjautuneen testikäyttäjän
  JWT:llä. Lähetä Supabase publishable-avain `apikey`-otsakkeessa ja käyttäjän
  istuntotunniste `Authorization: Bearer ...` -otsakkeessa. Älä liitä JWT:tä tai
  vastausta, jossa on tunnuksia, keskusteluun.
- Onnistunut vastaus: `ok: true` ja `deviceCount: 1`; lisäksi
  `positionAvailable: true` tarkoittaa, että sijainti saatiin. Aikaleiman
  vanheneminen on tulkittava erikseen.
- Jos `deviceCount > 1`, funktio ei valitse ajoneuvoa automaattisesti.
  Jos käyttäjän ID tai token puuttuu, funktio vastaa 503.
  Virhe `traccar_auth` tarkoittaa, että Traccarin tunnus ei kelpaa tai on vanhentunut.
- Token vanhenee asetettuna päivänä; poista testi ja sen salaisuudet, kun testijakso päättyy.

### Rajaukset

Tämä on kertaluonteinen yhteystesti, ei GPS-synkronointi tai julkinen päätepiste.
Ei jatkuvaa pollausta, ei sijaintihistorian siirtoa eikä jaetun tallin jäsenten
pääsyä Traccar-tietoihin. Laajemmassa ratkaisussa tarvitaan erillinen
ajoneuvo–GPS-laite-sidonta, käyttäjäkohtainen valtuutus, tietosuojapäätökset ja
kutsujen/kiintiöiden rajoittaminen.
