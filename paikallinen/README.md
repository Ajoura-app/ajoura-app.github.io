# Vaihe 07: paikallinen avustajan perusta

Tämä on paikallisesti testattava prototyyppi. Sillä ei ole Supabase-funktiota, tuotannon reittiä, toimittaja-avainta, TTS:ää eikä oikeita kielimallikutsuja. Vaihetta 08 ei aloiteta tässä muutoksessa.

## Toteutetut osat

- `analytiikka.js`: selaimen ja palvelinytimen yhteinen puhdas kulutus-, energia- ja huoltorajalaskenta. `app.js` käyttää tätä samaa toteutusta. Jäädytetty ennen-vaihetta-07 vertailutoteutus on testiaineistossa.
- `avustaja-sopimus.js`: yhden auton laskentaan tarvittava kenttäprojektio ja kanoninen esitys. Kuvat, rekisteritunnus, nimi, muistiinpanot ja muut autot eivät sisälly siihen. Ensimmäinen palvelinydin hyväksyy vain autot; muiden lajien laskentaparity testataan yhteisessä moduulissa, mutta backend palauttaa unsupported.
- `paikallinen/avustaja.mjs`: POST prepare/answer -ydin, jossa todennus, oikeudet, tietolähde ja toimittaja ovat injektoitavia riippuvuuksia. Ilman nimenomaista enabled-asetusta toiminto vastaa 503. Ei verkkokuuntelijaa tai oletustietolähdettä.
- `MemoryLedger`: vain yhden Node-prosessin testikirjanpito. Erillinen ai.assistant-kiintiö, 20/kk, 5/päivä ja 3/min oletusrajat. Enimmäisrahavaraus 656 000 nanodollaria/pyyntö, yhteinen kuukausikatto oletuksena 10 USD uusille avustajapyynnöille. Nykyisen receipt-kiintiön tietoja ei lueta tai muuteta.
- `avustaja-client.js`: erillinen opt-in ja tekstivastine paikalliselle kokeilulle. Kortti luodaan vain loopback-osoitteessa, kun testitransportti on nimenomaisesti injektoitu. Julkisessa Ajoura-osoitteessa kortti pysyy suljettuna myös, jos sama globaalimuuttuja injektoidaan.
- `sync.js.analysisReady()`: vain luku; tarkistaa istunnon, tallin omistajan, synkronointitilan, avoimet muokkauslomakkeet sekä paikallisten/pilvipohjan tietojen yhtäläisyyden. Tämä ei myönnä oikeutta. Testitransportin `fixture: true` ohittaa vain tämän testin, jotta kuvitteellista paikallista aineistoa voi kokeilla ilman Supabasea. Tuotannon oikeutta se ei voi avata.

Palvelimen HMAC-snapshot sitoo käyttäjän, palvelimen johtaman omistajan, auton, numerosisällön ja laskentaversion kahdeksi minuutiksi. Sisältö ja oikeus tarkistetaan uudelleen mallivaiheiden välissä ja ennen vastausta. Selaimen SHA-256-tiiviste vertautuu palvelimen laskentaprojektioon ennen lähettämistä ja ennen tuloksen näyttämistä. Pelkkä rev-numero tai asiakkaan tiiviste ei koskaan myönnä oikeutta.

Malliadapterin luokittelu saa vain kysymyksen ja sallitut tarkoitukset. Sanoitusvaihe saa validoidun numeroyhteenvedon ilman alkuperäistä kysymystä tai pysyviä lähdetunnisteita. Suljettu selitekoodi renderöidään FI/SV/EN-lausepohjilla. Kaikki vastaukset ovat no-store, ilman HTML:ää ja ilman vastausvirtausta.

## Toistettavat paikalliset tarkistukset

```sh
node --test --test-reporter=tap testit/analytiikka.test.cjs paikallinen/avustaja.test.mjs
python3 -m pytest testit/test_avustaja_local.py
```

Playwright-testi käynnistää fixture-serverin loopbackiin vapaalle portille, käyttää vain keksittyä JSON-aineistoa ja yhdistää selaimen todelliseen Node-ytimeen testisidonnalla. `fixture-server.mjs` vaatii `--fixture-only`-valinnan ja kuvitteellisen aineistotiedoston. Sen `fixture-user`-tunniste ei ole käyttökelpoinen ulkoisessa palvelussa. Palvelinta ei ole tarkoitettu tuotantoa tai julkista kuuntelua varten.

## Ennen mahdollista tuotantototeutusta

MemoryLedger ei ole moniprosessi-, uudelleenkäynnistys- tai tietokantakestävä. Sitä ei saa käyttää tuotannon budjetin suojaamiseen. Paikalliset authenticate/readVehicle/entitled-fixturet eivät toteuta Supabasen JWT-/RLS-integraatiota. Tuotantoadapteria, SQL-migraatiota, uusia käyttöoikeuksia tai palvelinreittiä ei lisätä tähän muutokseen. Niiden katselmointi ja käyttöönotto ovat erillinen työ.

Paikallinen unknown-tila säilyttää mahdollisesti lähetetyn pyynnön rahavarauksen ja estää automaattisen uusinnan samalla idempotenssiavaimella. Käyttäjän virhekiintiön palautus ei vapauta rahabudjettia. Eri sisältö samalla avaimella aiheuttaa 409:n. Yksityinen vastaus vanhenee viidessä minuutissa myös ajastimella; snapshot voi estää uusintapalautuksen jo kahden minuutin kohdalla. Muistikirjanpidolla ei ole vielä tuotantokäytön 90 päivän säilytys-/poistotyöntekijää.

Oikea malliadapteri puuttuu. Sen on pakotettava tokenrajat, estettävä SDK:n automaattiset uusinnat ja täsmäytettävä rahavaraus todelliseen laskutukseen. Nyt käytetyt maxInputTokens/maxOutputTokens ovat fixture-sopimuksen parametreja; tämä prototyyppi ei väitä niiden rajoittavan minkään olemattoman toimittajaintegraation laskutusta.

Tarvitaan myös toimittajapäätös, tietosuojatekstin hyväksyntä, sopimus-/käsittelyalueiden tarkistus, pysyvä poistokäytäntö sekä oikean iPhonen testit. Haiku-, STT- ja TTS-palveluita ei tilata eikä avata tästä koodista. Julkaisu ja main-haaraan yhdistäminen edellyttävät käyttäjän erillistä lupaa.
