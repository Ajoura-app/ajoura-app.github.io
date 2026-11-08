# Sovelluksen sisäisten havaintojen säännöt

Havainnot lasketaan valitun ajoneuvon omista kirjauksista laitteella. AI-palvelua, taustaseurantaa tai push-ilmoituksia ei tarvita. Tehtäväkortteja näytetään enintään kolme; Myöhemmin piilottaa kortin vuorokaudeksi ja Ohita sen nykyisen havaintotunnisteen ajaksi. Valinnat voi palauttaa ja ne koskevat vain tätä laitetta.

## Huoltorajan päiväarvio

Nykyiset tallennetut huoltovälit ja viimeisin huolto määräävät kilometrirajan ja kalenterirajan. Niiden laskentaa ei muuteta. Lähestyvään huoltotehtävään voidaan liittää kilometrirajan päiväarvio, jos kaikki ehdot täyttyvät:

- Henkilöauto tai nykyisen tietomallin tavallinen auto; tuntimittarilliset muut ajoneuvolajit rajataan pois.
- Vähintään neljä erillistä kirjauspäivää viimeisen 180 päivän ajalta ja vähintään 30 päivän aikajänne.
- Viimeisin kelvollinen kirjaus enintään 45 päivän takaa. Tulevia kirjauksia ei käytetä.
- Lukemat eivät pienene, saman päivän eri lukemia ei käytetä ja kahden kirjauspäivän välinen ajomäärä on enintään 500 km/päivä. Koko jakson keskitahti on 5–500 km/päivä.
- Nykyinen tankkauslaskenta ei ilmoita ristiriitaisia tai epäuskottavia lukemia. Kulutukseen kuulumattomaksi merkitty määrä ei itsessään tee mittarilukemaa tuntemattomaksi.
- Huoltoraja on vielä edessä, ja laskennallinen jäljellä oleva aika on enintään 180 päivää.

Arvio käyttää aikajänteen kilometrimuutosta / päiviä. Päiväväli lasketaan tahdeilla 1,25 × ja 0,75 × keskitahti. Väli on suuntaa-antava skenaario, ei tilastollinen luottamusväli. Se olettaa ajon jatkuvan samana eikä korvaa huollon kalenterirajaa tai valmistajan ohjetta. Ilman riittävää tietoa päiväarviota ei näytetä.

## Kulutusvahti

Käytössä ovat app.js:n nykyisen fuelStats-laskennan valmiit, hyväksytyt välit kullekin energialajille erikseen. Päivämääräristiriitojen 0.95-suodatus ja osatankkausten yhdistäminen säilyvät. Huomio jätetään varovaisesti kokonaan pois, jos aineistossa on ristiriitaisia/epäuskottavia lukemia, puuttuvaksi merkitty tankkaus (`skip`) tai samoja mittarilukemia. Historiassa oleva virhe voi siis estää myös tuoreen huomion, kunnes kirjaus korjataan.

Vertailussa on viimeisin ja kolme aiempaa hyväksyttyä väliä. Jokainen väli on vähintään 100 km, kolme aiempaa yhteensä vähintään 600 km. Viimeisimmän välin päättävä kirjaus on enintään 45 päivän takaa, ei tulevaisuudessa. Vertailukulutus on kolmen aiemman välin kilometreillä painotettu keskiarvo.

Huomio syntyy, kun viimeisin kulutus on vähintään 20 % suurempi ja absoluuttinen kasvu vähintään 1 l/100 km, 3 kWh/100 km tai 0,5 kg/100 km. Kyse on muutoksesta omiin kirjauksiin verrattuna; ajotapa, kuorma, vuodenaika ja olosuhteet voivat selittää sen. Havainnosta ei päätellä ajoneuvovikaa. Tunniste käyttää ajoneuvoa, energialajia ja viimeisen välin kirjausta, joten uudelleenpiirto ei luo duplikaatteja.

Havainnot eivät muuta ajoneuvotietoja tai varmuuskopioformaattia. Valmistunut kirjauksen korjaus arvioi havainnot uudelleen.
