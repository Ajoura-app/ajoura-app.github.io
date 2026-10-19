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
