# AJOURA – sovellusversiot ja varmuuskopiot

Jokainen rivi on varmuuskopio sovelluksesta ja verkkosivusta sellaisena kuin ne olivat julkaistuna sinä päivänä. Mihin tahansa versioon voi palata.

**Paluu vanhaan versioon:** kirjoita AJOURA-projektiin esimerkiksi *"palauta 0.09"*. Claude tallentaa ensin nykyisen tilan omaksi versiokseen (mitään ei katoa), palauttaa sovelluksen ja sivun valittuun versioon ja julkaisee sen. Käyttäjien autot ja merkinnät eivät muutu, koska ne ovat käyttäjien laitteilla ja tilillä, eivät sovelluksen koodissa.

**Päivitys:** lista päivittyy kerran päivässä (noin klo 22 Suomen aikaa), jos sovellukseen tai sivuun on tullut muutoksia, sekä aina kun pyydät ("tee uusi versio"). Versio nousee 0,01 kerrallaan: 0.09 → 0.10 → 0.11 … Isompi hyppy (esim. 1.0 virallinen julkaisu) tehdään vain pyynnöstä.

**Missä kopiot ovat:**
- GitHubissa haara `backup/VVVV-KK-PP-vX.XX` (repo Ajoura-app/ajoura-app.github.io; 19.10.2026 asti MestariHannes/Ajoura). Tämä on varsinainen palautuspiste.
- Koneellasi: `Ajoura\99_arkisto\versiot\X.XX_VVVV-KK-PP\` (zip: sovellus ja sivu, esittelyvideot erikseen kielittäin).
- Projektin jaetussa kansiossa: `ajoura/varmuuskopiot/`.

| Versio | Päivä | GitHub-haara | Mitä siinä on |
|---|---|---|---|
| 0.09 | 19.10.2026 | `backup/2026-10-19-v0.09` (commit 6900f2b) | Ensimmäinen varmuuskopio. Sovellus ja sivu suunnitteluvaiheessa: uusi etusivu Niklaksen mallien mukaan, pikatankkaus, autokohtaiset kulut, ajoneuvolajit (auto, mopo, moottoripyörä, vene, mönkijä, kelkka…), huoltohistoria ja raportti, historia linkkinä ostajalle, kolme kieltä (FI/SV/EN), esittelyvideo, omistajien ja autohuollon näkymät, sähköpostikirjautuminen ja synkronointi puhelimen ja sivun välillä. |
| 0.10 | 19.10.2026 | `backup/2026-10-19-v0.10` (repo Ajoura-app/ajoura-app.github.io) | Siirto uuteen osoitteeseen ajoura-app.github.io (tiedot siirtyvät vanhasta osoitteesta). Virhekierros: synkronointi ja tallennus turvallisemmiksi (toisen laitteen uudempi muutos ei jää alle, yksi viallinen ajoneuvo ei enää tyhjennä tallia), erääntyvät huollot myös kilometrirajan mukaan, pienet korjaukset. Etusivu toimii myös ilman verkkoa. |
| 0.11 | 22.10.2026 | `backup/2026-10-22-v0.11` (commit 5c4899c) | Kirjautuminen ja synkronointi pois käytöstä, tietosuojatekstit todellisuutta vastaaviksi, kellonaikatervehdys pois, huoltopalkin liukuva väri, merkintäsivu uudistettu (edellinen ja seuraava huolto, selaus, tulostus). |
| 0.14 | 22.10.2026 | `backup/2026-10-22-v0.14` (commit c95b07b) | Versionumeron nosto (0.12 ja 0.13 ohitettiin). |
| 0.15 | 22.10.2026 | `backup/2026-10-22-v0.15` (commit 18b43d1) | Yhteinen ilme: puhelimen oma fontti, kortit, painikkeet, lomakekentät, alavalikko. |
| 0.16 | 22.10.2026 | `backup/2026-10-22-v0.16` (commit 847f67e, sama sisältö kuin 1834025) | iPhonen päivämääräkenttä ei enää levitä näkymää sivusuunnassa. **Tämä on nyt julkaistu versio**: 0.17 palautettiin tähän Niklaksen pyynnöstä. |
| 0.17 (peruttu) | 22.10.2026 | `backup/2026-10-22-v0.17-peruttu` (commit 95e13aa) | Etusivun uusi ilme (ulkoasun pala 2/5). Peruttiin samana iltana, mutta on tallessa, jos siihen halutaan palata. Seuraava uusi versio on 0.18. |
