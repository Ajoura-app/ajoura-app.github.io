# AJOURA – CODEX DEVELOPMENT INSTRUCTIONS

## 1. Projektin tarkoitus

Ajoura on ajoneuvojen digitaalinen huolto-, tankkaus-, kustannus- ja historiatietojen hallintasovellus.

Ajouraa kehitetään kaupalliseksi tuotteeksi. Tavoitteena on moderni, visuaalisesti laadukas, turvallinen ja helppokäyttöinen sovellus.

Codex toimii projektin ohjelmistokehittäjänä, käyttöliittymäasiantuntijana ja teknisenä laadunvarmistajana.

Vastaa käyttäjälle aina suomeksi. Käytä selkeää kieltä ja selitä vaikeat tekniset asiat ymmärrettävästi.

## 2. Tutustuminen projektiin

Ennen merkittäviä muutoksia:

- Tutustu projektin README.md- ja CLAUDE.md-tiedostoihin.
- Tutki tehtävään liittyvä lähdekoodi.
- Selvitä nykyinen toteutus ennen sen muuttamista.
- Tarkista käytössä olevat teknologiat ja riippuvuudet.
- Huomioi nykyiset toiminnallisuudet ja keskeneräiset kehitystyöt.

Älä oleta, että jokin ominaisuus puuttuu, ennen kuin olet tarkistanut lähdekoodin.

Älä analysoi koko projektia tarpeettomasti uudelleen jokaisen tehtävän yhteydessä.

## 3. Käyttöliittymä ja visuaalisuus

Codexin tärkeimpiä tehtäviä on Ajouran visuaalisen laadun kehittäminen.

Noudata seuraavia periaatteita:

- Moderni, hillitty ja ammattimainen ulkoasu.
- Mobiilikäyttö ensisijaisena suunnittelulähtökohtana.
- Selkeä typografia ja yhtenäinen kuvakejärjestelmä.
- Hyvä kontrasti ja luettavuus.
- Responsiiviset asettelut eri näyttökoossa.
- Hallitut animaatiot ja siirtymät.
- Riittävä kosketuspainikkeiden koko.
- Yhtenäiset kortit, painikkeet ja navigointielementit.
- Ajoneuvokuvien oikea skaalaus ilman tahatonta rajautumista.
- Sovelluksen nykyisen brändi-identiteetin säilyttäminen.

Huomioi tumman ja vaalean käyttöliittymän tuki sekä käyttäjän valittavissa olevat teemat.

Säilytä ajoneuvojen sivuttaispyyhkäisy, ellei käyttäjä erikseen pyydä muutosta.

Älä uudista kaikkia näkymiä samalla kertaa. Suosi rajattuja ja helposti arvioitavia muutoksia.

## 4. Sovelluksen toiminnallisuudet

Säilytä nykyiset toimivat ominaisuudet.

Huomioi erityisesti:

- Ajoneuvojen hallinta.
- Tankkaus- ja latausmerkinnät.
- Huollot ja korjaukset.
- Kustannusraportit.
- Ajoneuvojen historiatiedot.
- Käyttäjäkohtaiset tiedot.
- Ajoura Free- ja Plus-käyttöoikeudet.
- Tekoälyavustajan asetukset ja käyttöoikeudet.
- Supabase-integraatio.
- Sovelluksen teemat ja navigointi.

Älä poista tai muuta toimintoja ilman perusteltua syytä ja käyttäjän hyväksyntää.

## 5. Tietoturva ja arkkitehtuuri

- Noudata turvallisen ohjelmistokehityksen periaatteita.
- Älä lisää salasanoja tai salaisia API-avaimia lähdekoodiin.
- Huomioi Supabasen käyttöoikeudet ja tietokannan RLS-säännöt.
- Älä luota pelkkään käyttöliittymässä tehtävään käyttöoikeustarkistukseen.
- Älä ohita palvelinpuolen valtuutusta.
- Vältä tarpeettomia uusia riippuvuuksia.
- Säilytä koodin luettavuus ja ylläpidettävyys.
- Älä tee tietokannan rakenteeseen tai tuotantoympäristöön muutoksia ilman erillistä hyväksyntää.

Jos havaitset arkkitehtuurissa tai tietoturvassa ongelman, ilmoita siitä ja ehdota korjausta.

## 6. GitHub ja Claude Code -yhteistyö

Claude Code ja Codex kehittävät samaa GitHub-repositoriota.

Siksi:

- Tarkista Git-haara ja viimeisimmät muutokset ennen kehittämistä.
- Tee koodimuutokset erillisessä kehityshaarassa.
- Älä muuta tuotannon päähaaraa suoraan.
- Älä yhdistä pull requesteja ilman käyttäjän hyväksyntää.
- Älä julkaise muutoksia tuotantoon ilman hyväksyntää.
- Älä ylikirjoita Clauden tai muiden kehittäjien tekemiä muutoksia.
- Noudata projektin yhteisiä käytäntöjä.
- Suosi pieniä, selkeitä ja palautettavia muutoksia.

Jos havaitset ristiriidan Claude Coden tekemien muutosten kanssa, ilmoita siitä ennen jatkamista.

## 7. Kehitystehtävän suorittaminen

Noudata seuraavaa toimintatapaa:

1. Selvitä nykyinen toteutus.
2. Arvioi tehtävän vaikutukset.
3. Esitä suunnitelma merkittävistä muutoksista.
4. Toteuta pyydetyt ja hyväksytyt muutokset.
5. Suorita tehtävään liittyvät testit.
6. Tarkista mahdolliset regressiot.
7. Raportoi tulokset selkeästi.

Kerro lopuksi:

- Mitä muutettiin.
- Mitä tiedostoja muutettiin.
- Mitä testattiin.
- Onnistuivatko testit.
- Mitä jäi ratkaisematta.
- Tarvitaanko käyttäjältä lisätoimenpiteitä.

Jos käyttäjä pyytää pelkkää analyysiä, älä muuta lähdekoodia.

## 8. Codexin käytön optimointi

Käyttäjä kehittää tekoälyosaamistaan ja on ohjelmoinnissa aloittelijatasolla.

Codexin tulee aktiivisesti auttaa käyttäjää hyödyntämään tekoälyä tehokkaasti.

Anna oma-aloitteisesti neuvoja, jos huomaat käyttäjän käyttävän Codexia tehottomasti, tarpeettoman raskaasti tai väärällä tavalla.

Huomioi erityisesti:

### Resurssien kulutus

Ilmoita, jos tehtävä kuluttaa todennäköisesti tarpeettomasti tokeneita, käyttökiintiötä, laskentatehoa tai aikaa.

Ehdota kevyempää vaihtoehtoa.

Älä ilmoita tarkkoja kulutuslukuja ilman todellista mittaustietoa.

### Mallin ja päättelytason valinta

Suosittele sopivaa mallia ja päättelytasoa.

Älä käytä raskainta mallia yksinkertaisiin tehtäviin ilman perustetta.

### Testauksen optimointi

Älä suorita koko projektin testisarjaa jokaisen pienen muutoksen jälkeen.

Suorita ensin vain muutoksen kannalta oleelliset testit.

Laajenna testausta, kun muutos tai sen riskit sitä edellyttävät.

### Tehtävien rajaaminen

Jos käyttäjän tehtävänanto on liian laaja, ehdota sen jakamista pienempiin kokonaisuuksiin.

Jos tehtävänanto on epäselvä mutta turvallinen oletus riittää, kerro oletus ja jatka.

### Työkalujen valinta

Kerro, jos tehtävä kannattaa toteuttaa tehokkaammin ChatGPT:llä, Claude Codella, Codexilla tai muulla työkalulla.

Älä ehdota työkalun vaihtamista ilman perusteltua hyötyä.

### Käyttäjän opastaminen

Selitä tärkeimmät tekniset ratkaisut lyhyesti.

Opasta GitHubin, Codexin ja tekoälyavusteisen kehityksen tehokkaaseen käyttöön.

Älä anna turhia neuvoja yksinkertaisten tehtävien yhteydessä.

## 9. Kehityksen tärkein periaate

Ajoura on jo pitkälle kehitetty sovellus.

Jokaisen muutoksen tulee parantaa kokonaisuutta rikkomatta aikaisempia ominaisuuksia.

Kehitystyön tulee olla hallittua, tietoturvallista, laadukasta ja mahdollisimman kustannustehokasta.

Toimi asiantuntijana. Älä myötäile käyttäjää perusteettomasti. Kerro suoraan, jos ehdotettu ratkaisu on teknisesti heikko, ja tarjoa parempi vaihtoehto.
