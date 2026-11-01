Ajoura: ohje Claude Codelle
Ajoura on digitaalinen auton huoltokirja (PWA, selainsovellus). Koodi on tässä repossa, ja main-haara julkaistaan automaattisesti GitHub Pagesiin (ajoura-app.github.io/app.html). Repo on julkinen. Sovellus on rakennettu Clauden avulla, tekijöitä on kaksi (Niklas ja Hannes), eikä kumpikaan ole koodauksen tai yritystoiminnan asiantuntija.
Työtapa

* Vastaa suomeksi, lyhyesti ja selkeästi. Ei pitkiä johdantoja eikä toistoa.
* Selitä asiat selkokielellä ja avaa ammattitermit lyhyesti ensimmäisellä kerralla.
* Toimi asiantuntijana, älä myötäile. Jos pyyntö tai oletus on huono, riskialtis tai virheellinen, sano se suoraan ja ehdota parempaa.
* Kun vaihtoehtoja on useita, valitse yksi ja kerro miksi. Nosta itse esiin riskit.
* Sano suoraan, jos et tiedä tai tieto voi olla vanhentunutta. Lakiin perustuvat tekstit (esim. renkaat) tarkistetaan viranomaisen sivulta (Traficom).
* Vältä kustannuksia. Jos jokin maksaa, kerro hinta ja ilmainen vaihtoehto ennen kuin ehdotat sitä. Älä lisää uusia ulkoisia kirjastoja tai palveluita ilman perustetta.
* Pysy siinä, mitä pyydetään.

Itsenäinen työ
Kun Niklas antaa tehtävän tai tehtäväjonon, suunnittele, toteuta, testaa ja julkaise ilman välihyväksyntöjä omien suositustesi mukaan. Älä pyydä erikseen hyväksyntää suunnitelmalle tai julkaisulle.
Pysähdy vasta, kun

1. tehtävä tai jono on tehty,
2. porras vaihtuu (portaat: perusta, toimiva ydin, testikäyttäjät, nimi ja juridiikka, julkinen julkaisu, yritys, sovelluskaupat, maksulliset ominaisuudet; nyt ollaan portaassa 2),
3. tarvitaan kuvia (ajoneuvokuvat tekee Niklas ChatGPT:llä),
4. testit kaatuvat eikä korjaus onnistu parilla yrityksellä, tai
5. muutos kuuluu kysy-ensin-listaan.

Kysy-ensin-lista (kysy Niklakselta ennen tekemistä): tallennettujen tietojen muoto, varmuuskopio ja siirto, synkronointi, offline-osa (sw.js), tietosuoja ja juridiikka, kustannukset.
Tallennettujen tietojen suoja

* Käyttäjän tiedot ovat laitteessa (IndexedDB ja localStorage). Niitä ei koskaan tyhjennetä päivityksen tai välimuistin vaihdon yhteydessä.
* Tallennettujen tietojen muotoa (auton, merkintöjen, muistiinpanojen ja tankkausten kentät, varmuuskopiotiedosto) ei muuteta ilman siirtokoodia ja testiä, jossa vanhan version varmuuskopio palautetaan.
* Uusi toimenpide, korityyppi tai pakollinen kenttä rikkoo vanhan version palautuksen. Tarkista validCar ja allItems app.js:stä ennen kuin lisäät sellaisen.
* Kirjautuminen ja pilvisynkronointi (sync.js, Supabase) ovat tarkoituksella pois käytöstä. Älä ota niitä käyttöön.

Julkaisun kulku

1. Hae uusin main (git fetch). Lue VERSIOT.md: siinä on julkaistu versio ja historia.
2. Tee varmuuskopiohaara vanhasta mainista: backup/VVVV-KK-PP-ennen-v0.xx. Tee työ omassa haarassa: esikatselu/VVVV-KK-PP-v0.xx-aihe.
3. Jokainen korjaus tai muutos on oma versionsa ja oma commitinsa. Pieni korjaus ei saa kulkea mukana ulkoasumuutoksessa.
4. Jokainen muutos lisää oman testinsä kansioon testit/. Uusi testi todetaan toimivaksi rikkomalla sovelluksen kopio tarkoituksella.
5. Aja perussarja ennen julkaisua: `python3 -m pytest testit` (noin 4,5 min). Jos muutos koskee tallennusta, varmuuskopiota, PDF:ää, ulkoasua tai offline-osaa, aja myös laaja sarja edellistä versiota vastaan (ohje: testit/README.md).
6. Versionumero (0.xx) nousee 0,01 jokaisesta sovellusmuutoksesta ja on neljässä paikassa: app.js (appVersion), index.html, i18n.js ja i18n-sv.js. Välimuistin numerot nousevat yhdessä: ak-N sivujen ?v=-tunnuksissa (app.html, index.html, tietosuoja.html, historia.html) ja sw.js:n VERSION-rivillä, sekä sw.js:n CACHE = 'ajoura-pwa-N', jossa N = ak-numero + 50. Testi test_offline.py huomaa, jos ne eivät täsmää. Uusi skriptitiedosto lisätään app.html:ään ja sw.js:n FILES-listaan.
7. Pelkkä testi- tai dokumenttimuutos (testit/, VERSIOT.md, CLAUDE.md) ei nosta versionumeroa eikä välimuistin numeroita.
8. Kirjaa versio VERSIOT.md:hen (merkintä "Tämä on nyt julkaistu versio." siirretään uudelle riville).
9. Vie main-haaraan, kun testit menevät läpi. Älä käytä pakotettua pushia (--force). Tarkista lopuksi, että Pages-julkaisu onnistui (GitHubin Actions-ajo "pages build and deployment").

Koodin säännöt

* Kaikki näkyvät tekstit ovat kolmella kielellä (suomi, englanti, ruotsi). Suomenkieliset tekstit koodissa kääntyvät sanakirjoista i18n.js ja i18n-sv.js: lisää jokaiselle uudelle tai muutetulle tekstille oma lohko ja tarkista ensin, onko avain jo olemassa. Huolto- ja kausivinkit ovat tips.js:ssä (kolme kieltä samalla rivillä). test_kielet.py löytää kääntämättömät tekstit.
* Luettavuus: muutetussa näkymässä teksti vähintään 11 px (puhelimessa noin 12 px) ja kontrasti vähintään 4,5:1. Lomakekentät iPhonessa vähintään 16 px.
* Ulkoasumuutoksista tee ennen/jälkeen-kuvat (leveydet 320–430 px, tumma tila, kolme kieltä, tuloste) ja liitä ne yhteenvetoon.
* Etsi koodista ensin olemassa oleva ratkaisu ennen kuin teet uuden (esim. raporttien laskenta rpCalc, tankkausten laskenta fuelStats). Älä kopioi laskentaa.
* Testin TUNNETUT-listoille (test_kielet.py, test_leveys.py) ei lisätä mitään vain testin läpäisemiseksi. Löydetty virhe korjataan ja rivi poistetaan listalta.

Julkinen repo: ei salaisuuksia

* Älä lisää repoon avaimia, salasanoja, oikeita käyttäjätietoja tai Niklaksen oikeaa varmuuskopiota. Testeissä käytetään vain keksittyjä tietoja.
* Älä kirjoita tähän tiedostoon tai muihin repon tiedostoihin sisäisiä suunnitelmia, jotka eivät kuulu julkisiksi.

Mitä Code ei tiedä

* Hankkeen päätökset, avoimet asiat ja korjauslista (AJ-numerot) ovat Niklaksen claude.ai-projektissa, eivät tässä repossa. Jos tarvitset sieltä jotain, pyydä Niklasta liittämään se. Älä arvaa päätöksiä, jotka eivät näy koodista, VERSIOT.md:stä tai testeistä.
* Testit löytävät tunnetut virheet: AJ-26 ja AJ-27 ovat testien TUNNETUT-listoilla (testit/test_kielet.py ja testit/test_leveys.py).
* Oikean iPhonen testit tekee Niklas käsin. Mainitse jokaisen julkaisun jälkeen, mitä iPhonella pitää tarkistaa.

Lopuksi kerro
Jokaisen julkaisun jälkeen lyhyesti suomeksi: mitä teit ja miksi, mitä testasit (tulos), mitä Niklaksen pitää tarkistaa iPhonella, ja mikä on seuraava järkevä askel. Kerro myös, jos jokin tehtiin eri tavalla kuin pyydettiin.
