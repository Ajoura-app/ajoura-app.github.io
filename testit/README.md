# AJOURAn automaattinen testisarja (AJ-09)

Testit ovat pieniä ohjelmia, jotka käyttävät sovellusta oikeassa selaimessa (Chromium) ihmisen tavoin:
lisäävät auton, kirjaavat merkinnän, tankkaavat, tallentavat ja palauttavat varmuuskopion. Lopuksi ne
tarkistavat, että tulos on oikea. Testit eivät ole osa sovellusta: ne eivät muuta käyttäjien näkemää
sovellusta eivätkä koske kenenkään oikeisiin tietoihin.

**Sääntö:** testit ajetaan ennen jokaista julkaisua. Jokainen uusi pala lisää oman testinsä.

## Ajo

Repon juurikansiossa:

```
python3 -m pytest testit
```

Perussarja kestää noin 3–4 minuuttia. Tulos on joko `N passed` (kaikki kunnossa) tai lista epäonnistuneista
testeistä ja syy suomeksi, esim. `#tips: näkymä ei piirtynyt. JS-virhe: …`.

Sarja käynnistää paikallisen palvelimen itse, joten erillistä taustapalvelinta ei tarvita.
Ulkoverkko on testeissä estetty (esim. autokuvapalvelu), joten tulos ei riipu verkosta.

Vaatimukset: Python 3, `pytest`, `playwright` ja Chromium (valmiina Clauden ympäristössä; muualla
`pip install pytest playwright pillow` ja `python3 -m playwright install chromium`). PDF-testit tarvitsevat
lisäksi ohjelmat `qpdf`, `pdfinfo` ja `pdftotext` (poppler-utils).

## Laajennettu sarja

Ajetaan, kun muutos koskee tallennusta, varmuuskopiota, PDF:ää tai ulkoasua. Se vertaa uutta versiota
edelliseen julkaistuun versioon (main):

```
git worktree add --detach ../edellinen origin/main
AJOURA_VERTAILU=../edellinen python3 -m pytest testit -m laaja
python3 testit/vertaa_nakymat.py ../edellinen
git worktree remove ../edellinen
```

- `test_laaja_edellinen.py`: varmuuskopio edestakaisin uuden ja vanhan version välillä (neljä suuntaa,
  kaikkien pitää olla identtisiä). Varmistaa, ettei uusi versio hävitä tietoja tai tee tiedostoa, jota
  puhelimessa vielä oleva vanha versio ei osaa lukea.
- `test_laaja_pdf.py`: PDF-tiedostot suomeksi, englanniksi ja ruotsiksi (ehjä, A4, oikeat luvut, ei
  suomenkielisiä tekstejä vieraskielisessä).
- `vertaa_nakymat.py` (ei testi vaan raportti): listaa näkymät, joiden sisältö muuttui. Ero on odotettu
  niissä näkymissä, joita versio muutti; muualla se on todennäköisesti tahaton ja tarkistetaan.

## Mitä perussarja tarkistaa

| Tiedosto | Sisältö |
|---|---|
| `test_nakymat.py` | Kaikki näkymät aukeavat ilman JavaScript-virheitä ja puuttuvia tiedostoja (FI/EN/SV, täysi ja tyhjä talli) |
| `test_ajoneuvo.py` | Auton ja veneen lisäys lomakkeella, tiedot säilyvät uudelleenlatauksessa |
| `test_merkinta.py` | Merkinnän lisäys, muokkaus ja poisto, huoltolaskuri, työn tekijä, tuleva päivä hylätään |
| `test_tankkaus.py` | Tankkausikkuna, litrojen laskenta, keskikulutus, muokkaus ja poisto |
| `test_varmuuskopio.py` | Tallennus (lataus ja iPhonen jakovalikko), identtinen palautus kuvineen, aito 0.37:n varmuuskopio, yhdistäminen, viallinen tiedosto hylätään |
| `test_haitallinen.py` | HTML-koodi käyttäjän teksteissä näkyy tekstinä (myös ostajan linkissä), CSV:n kaavasuoja |
| `test_kielet.py` | Kääntämättömät tekstit englanniksi ja ruotsiksi |
| `test_leveys.py` | Ei vaakavieritystä 320 ja 430 px leveydellä |

## Tunnetut puutteet

Testeissä on listat `TUNNETUT` (test_kielet.py ja test_leveys.py): löydetyt pienet virheet, jotka korjataan
omana versionaan. Kun virhe on korjattu, rivi poistetaan listalta. Listalle ei lisätä mitään vain siksi,
että testi menisi läpi.

## Uuden testin lisääminen

1. Tee uusi tiedosto `test_<aihe>.py` tai lisää funktio olemassa olevaan. Funktion nimi alkaa `test_`.
2. Avaa sovellus apufunktiolla: `s = avaa(browser, base, "vehicle/tst1", autot=tiedot.talli(), kello=KELLO)`.
   Muut valinnat (`apu.py`): kieli, teema, leveys, `mobiili=False` (tietokone, lataukset), `ios=True`,
   `asennettu=True` (Koti-valikon sovellus), `jako="ok"|"abort"` (jakovalikko), `leike=True` (ostajan linkki).
3. Toimi kuten käyttäjä (`s.page.click(...)`, `s.page.fill(...)`) ja tarkista tulos `assert`-lauseella,
   esim. `s.talli()` palauttaa laitteeseen tallentuneet tiedot.
4. Sulje lopuksi: `s.sulje()` (`try/finally`).
5. Varmista, että testi oikeasti huomaa virheen: riko kopio sovelluksesta tarkoituksella
   (`AJOURA_JUURI=<kopio> python3 -m pytest testit -k <testi>`) ja katso, että testi epäonnistuu.

Päivästä riippuvat testit käyttävät kiinteää päivää `KELLO` (29.10.2026, apu.py).

## Testitiedot

- Vain keksittyjä tietoja (`tiedot.py`, tunnukset TST-…). **Repo on julkinen: oikeaa varmuuskopiota tai
  kenenkään oikeita tietoja ei koskaan lisätä tänne.**
- `aineisto/varmuuskopio-0.37.json` on oikean version 0.37 tekemä varmuuskopio keksityillä tiedoilla.
  Sen voi tehdä uudelleen skriptillä `tee_vanha_varmuuskopio.py` (ohje tiedoston alussa).
