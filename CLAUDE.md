# Ajoura: ohje Claude Codelle

Ajoura on digitaalinen auton huoltokirja (PWA, selainsovellus). Koodi on tässä repossa, ja main-haara julkaistaan automaattisesti GitHub Pagesiin (ajoura-app.github.io/app.html). Repo on julkinen. Sovellus on rakennettu Clauden avulla, tekijöitä on kaksi (Niklas ja Hannes), eikä kumpikaan ole koodauksen tai yritystoiminnan asiantuntija.

## Työtapa
- Vastaa suomeksi, lyhyesti ja selkeästi. Ei pitkiä johdantoja eikä toistoa.
- Selitä asiat selkokielellä ja avaa ammattitermit lyhyesti ensimmäisellä kerralla.
- Toimi asiantuntijana, älä myötäile. Jos pyyntö tai oletus on huono, riskialtis tai virheellinen, sano se suoraan ja ehdota parempaa.
- Kun vaihtoehtoja on useita, valitse yksi ja kerro miksi. Nosta itse esiin riskit.
- Sano suoraan, jos et tiedä tai tieto voi olla vanhentunutta. Lakiin perustuvat tekstit (esim. renkaat) tarkistetaan viranomaisen sivulta (Traficom).
- Vältä kustannuksia. Jos jokin maksaa, kerro hinta ja ilmainen vaihtoehto ennen kuin ehdotat sitä. Älä lisää uusia ulkoisia kirjastoja tai palveluita ilman perustetta.
- Pysy siinä, mitä pyydetään.

## Itsenäinen työ
Kun Niklas antaa tehtävän tai tehtäväjonon, suunnittele, toteuta, testaa ja julkaise ilman välihyväksyntöjä omien suositustesi mukaan. Älä pyydä erikseen hyväksyntää suunnitelmalle tai julkaisulle.

Pysähdy vasta, kun
1. tehtävä tai jono on tehty,
2. porras vaihtuu (portaat: perusta, toimiva ydin, testikäyttäjät, nimi ja juridiikka, julkinen julkaisu, yritys, sovelluskaupat, maksulliset ominaisuudet; nyt ollaan portaassa 2),
3. tarvitaan kuvia (ajoneuvokuvat tekee Niklas ChatGPT:llä),
4. testit kaatuvat eikä korjaus onnistu parilla yrityksellä, tai
5. muutos kuuluu kysy-ensin-listaan.

**Kysy-ensin-lista (kysy Niklakselta ennen tekemistä):** tallennettujen tietojen muoto, varmuuskopio ja siirto, synkronointi, offline-osa (sw.js), uusi tekoälytoiminto (tietosuojakohta ja kustannusarvio), tietosuoja ja juridiikka, kustannukset.

## Tallennettujen tietojen suoja
- Käyttäjän tiedot ovat laitteessa (IndexedDB ja localStorage). Niitä ei koskaan tyhjennetä päivityksen tai välimuistin vaihdon yhteydessä.
- Tallennettujen tietojen muotoa (auton, merkintöjen, muistiinpanojen ja tankkausten kentät, varmuuskopiotiedosto) ei muuteta ilman siirtokoodia ja testiä, jossa vanhan version varmuuskopio palautetaan.
- Uusi toimenpide, korityyppi tai pakollinen kenttä rikkoo vanhan version palautuksen. Tarkista validCar ja allItems app.js:stä ennen kuin lisäät sellaisen.
- Kirjautuminen (Google) ja pilvisynkronointi ovat käytössä (0.116–0.117). Pilvitalli on kopio laitteen tiedoista; kuvat ja kuitit jäävät laitteelle. Pilvisynkronoinnin muutokset kuuluvat kysy-ensin-listaan (ks. Pilvi ja tekoäly).

## Pilvi ja tekoäly (0.116–0.117)
- Supabase-projekti `sjamwwcqrwspwvilurqn` (EU, ilmainen taso). Koodi on kansiossa `supabase/` (migrations/, functions/tekoaly, config.toml, README.md). Supabasen GitHub-yhteys ottaa main-haaran muutokset käyttöön automaattisesti, joten migraatio tai funktio menee tuotantoon main-pushin mukana. Julkaistua migraatiota ei muuteta: uusi muutos on uusi tiedosto.
- Kirjautuminen: Google-tili. Päätös 6.11.2026: julkinen kirjautuminen pidetään toistaiseksi suljettuna. Supabasen asetuksen "Salli uusien käyttäjien rekisteröityminen" pitää olla pois päältä (tarkista Supabasesta, ks. supabase/README.md), jolloin vain jo luodut testaajien tilit toimivat. Asetus avataan vasta julkisessa julkaisussa. Yritystä ei ole vielä perustettu: rekisterinpitäjät ovat Hannes ja Niklas yksityishenkilöinä (yhteys info.ajoura@gmail.com, tietosuojaseloste 0.118); yritys perustetaan myöhemmin. `sync.js` omistaa istunnon ja synkronoi tallin pilveen. Jaettu talli: omistaja kutsuu linkillä, jäsenet muokkaavat samaa tallia.
- Tekoäly: kaikki oikeustarkistukset vain `access.js`:ssä (AjouraAccess) ja palvelimella. Tekoälykutsut kulkevat vain Supabasen tekoälyfunktion (`supabase/functions/tekoaly`) kautta, ei koskaan suoraan selaimesta. Funktio tarkistaa käyttäjän, oikeuden ja kiintiön jokaisessa pyynnössä. Selaimen asetus (esim. localStorage) ei koskaan anna oikeutta.
- Malli: Claude Haiku 5.5 (`@anthropic-ai/sdk` 1.1.0). Avain on Supabasen salaisuus `ANTHROPIC_API_KEY`, ei koskaan repossa.
- Toteutettu: "Täytä kuvasta" tankkausikkunassa (`ai.receipt`, 1.19): yksi painike, ja tekoäly tunnistaa kuvan lajin itse (kuitti, tankkausmittarin näyttö tai auton mittaristo). Kaikki käyttävät samaa kuukausikiintiötä. `ai.odometer` (mittari muualla kuin tankkausikkunassa) ja `ai.servicebook` (huoltokirja) vastaavat palvelimelta 501. Uusi kuvalaji lisätään samaan `ai.receipt`-ohjeeseen ja skeemaan (`supabase/functions/tekoaly`), ei uutta painiketta.
- Testivaihe: kirjautunut käyttäjä saa tekoälyn ilman Plussaa, 10 tunnistusta/kk (Plus 30). Maksujen tultua suljetaan yhdellä tietokantarivin muutoksella (supabase/README.md).
- Päätökset: kehitetään ilman kustannuksia niin pitkään kuin mahdollista, maksulliset palvelut vasta oikeassa versiossa. Kuvia saa lähettää Anthropicille (tietosuojaseloste kertoo tämän). Jokainen uusi tekoälytoiminto tarvitsee oman kohdan tietosuojaselosteeseen (Niklas hyväksyy tekstin ennen julkaisua) ja kustannusarvion: tee ne ennen toteutusta ja kysy Niklakselta.
- Testit: test_plus.py, test_kuitti.py, test_pilvi.py, test_jaettu.py, test_supabase.py (SQL ajetaan paikallisessa PostgreSQL:ssä, `apt-get install postgresql`).

## Julkaisun kulku
1. Hae uusin main (git fetch). Lue VERSIOT.md: siinä on julkaistu versio ja historia.
2. Tee varmuuskopiohaara vanhasta mainista: backup/VVVV-KK-PP-ennen-v0.xx. Tee työ omassa haarassa: esikatselu/VVVV-KK-PP-v0.xx-aihe. Julkaisun yhteydessä tee myös backup/VVVV-KK-PP-v0.xx versiocommitista.
3. Jokainen korjaus tai muutos on oma versionsa ja oma commitinsa. Pieni korjaus ei saa kulkea mukana ulkoasumuutoksessa. Commitin tekijä: "Niklas (Claude) <noreply@anthropic.com>".
4. Jokainen muutos lisää oman testinsä kansioon testit/. Uusi testi todetaan toimivaksi rikkomalla sovelluksen kopio tarkoituksella.
5. Aja perussarja ennen julkaisua: `python3 -m pytest testit` (noin 4,5 min). Jos muutos koskee tallennusta, varmuuskopiota, PDF:ää, ulkoasua tai offline-osaa, aja myös laaja sarja edellistä versiota vastaan (ohje: testit/README.md).
6. Versionumero on muotoa 1.xx (Niklas 7.11.2026: aiempi 0.1xx-numerointi päättyi versioon 0.118, ja 0.119 on nyt 1.19). Se nousee 0,01 jokaisesta sovellusmuutoksesta (1.19 → 1.20 → … → 1.99 → 1.100 → 1.101 …; 2.0 vain pyynnöstä) ja on neljässä paikassa: app.js (appVersion), index.html, i18n.js ja i18n-sv.js. Välimuistin numerot nousevat yhdessä: ak-N sivujen ?v=-tunnuksissa (app.html, index.html, tietosuoja.html, historia.html) ja sw.js:n VERSION-rivillä, sekä sw.js:n CACHE = 'ajoura-pwa-N', jossa N = ak-numero + 50. Testi test_offline.py huomaa, jos ne eivät täsmää. Uusi skriptitiedosto lisätään app.html:ään ja sw.js:n FILES-listaan.
7. Pelkkä testi- tai dokumenttimuutos (testit/, VERSIOT.md, CLAUDE.md) ei nosta versionumeroa eikä välimuistin numeroita.
8. Kirjaa versio VERSIOT.md:hen omana commitinaan (merkintä "Tämä on nyt julkaistu versio." siirretään uudelle riville).
9. Vie main-haaraan, kun testit menevät läpi. Älä käytä pakotettua pushia (--force). Tarkista lopuksi, että Pages-julkaisu onnistui (GitHubin Actions-ajo "pages build and deployment").

## Koodin säännöt
- Kaikki näkyvät tekstit ovat kolmella kielellä (suomi, englanti, ruotsi). Suomenkieliset tekstit koodissa kääntyvät sanakirjoista i18n.js ja i18n-sv.js: lisää jokaiselle uudelle tai muutetulle tekstille oma lohko ja tarkista ensin, onko avain jo olemassa. Huolto- ja kausivinkit ovat tips.js:ssä (kolme kieltä samalla rivillä). test_kielet.py löytää kääntämättömät tekstit.
- Värit ja teemat (0.110): app.css:n, roles.css:n ja ajoura.css:n värit ovat muotoa `var(--c-xxxxxx,#xxxxxx)`; teemat (Asetukset → Teeman valinta) antavat niille omat arvonsa teemat.css:ssä. Kirjoita uusi väri tavallisesti (#xxxxxx) ja aja sen jälkeen `python3 tyokalut/teemat.py`, joka muuttaa sen muuttujaksi ja laskee teemoille vastineet. test_teemat.py huomaa unohtuneen ajon ja heikentyneen kontrastin. Teemakohtaiset piirteet kirjoitetaan teemat.css:n loppuosaan.
- Luettavuus: muutetussa näkymässä teksti vähintään 11 px (puhelimessa noin 12 px) ja kontrasti vähintään 4,5:1. Lomakekentät iPhonessa vähintään 16 px.
- Ulkoasumuutoksista tee ennen/jälkeen-kuvat (leveydet 320–430 px, tumma tila, kolme kieltä, tuloste) ja liitä ne yhteenvetoon.
- Etsi koodista ensin olemassa oleva ratkaisu ennen kuin teet uuden (esim. raporttien laskenta rpCalc, tankkausten laskenta fuelStats). Älä kopioi laskentaa.
- Testin TUNNETUT-listoille (test_kielet.py, test_leveys.py) ei lisätä mitään vain testin läpäisemiseksi. Löydetty virhe korjataan ja rivi poistetaan listalta.

## Julkinen repo: ei salaisuuksia
- Älä lisää repoon avaimia, salasanoja, oikeita käyttäjätietoja tai Niklaksen oikeaa varmuuskopiota. Testeissä käytetään vain keksittyjä tietoja.
- Älä kirjoita tähän tiedostoon tai muihin repon tiedostoihin sisäisiä suunnitelmia, jotka eivät kuulu julkisiksi.

## Mitä Code ei tiedä
- Hankkeen päätökset, avoimet asiat ja korjauslista (AJ-numerot) ovat Niklaksen claude.ai-projektissa, eivät tässä repossa. Niklas liittää tehtävän tekstin viestiin. Jos tarvitset muuta sieltä, pyydä Niklasta liittämään se. Älä arvaa päätöksiä, jotka eivät näy koodista, VERSIOT.md:stä tai testeistä.
- Testien TUNNETUT-listat ovat tyhjiä (AJ-26 ja AJ-27 tehty versioissa 0.63–0.64).
- Oikean iPhonen testit tekee Niklas käsin. Mainitse jokaisen julkaisun jälkeen, mitä iPhonella pitää tarkistaa.

## Lopuksi kerro
Jokaisen julkaisun jälkeen lyhyesti suomeksi: mitä teit ja miksi, mitä testasit (tulos), mitä Niklaksen pitää tarkistaa iPhonella, ja mikä on seuraava järkevä askel. Kerro myös, jos jokin tehtiin eri tavalla kuin pyydettiin.

Anna jokaisen vastauksen lopussa suositus seuraavan tehtävän mallista ja panostuksesta (effort) perusteluineen. Ohje: pienet tekstimuutokset ja dokumentit Sonnet 5.5 + medium; tavallinen ominaisuus Sonnet 5.5 + high; tietoturva, tietokanta, tallennuksen muoto, tekoälypalvelin ja isot muutokset Opus 5.5 + high; Haiku 5.5 vain yksinkertaisiin hakutehtäviin. Fable 5.1 on kallein, eikä sitä tarvita tässä projektissa. Korkeampi panostus on hitaampi ja kuluttaa enemmän käyttörajaa, joten nosta sitä vain, kun virheen hinta on suuri. Malli valitaan komennolla /model.
