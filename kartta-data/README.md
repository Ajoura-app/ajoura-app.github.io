# Kartan paikat (huoltoasemat, korjaamot, latauspisteet)

`paikat.json` on Kartta-välilehden aineisto (AJOURA 2.31). Lähde: OpenStreetMap, © OpenStreetMap-tekijät.
Aineisto on lisensoitu **Open Database License 1.0** -lisenssillä (https://opendatacommons.org/licenses/odbl/1-0/),
ja tämä johdettu tiedosto on samalla lisenssillä julkinen ODbL-aineisto.

- Rakennetaan skriptillä `tyokalut/karttapaikat.py` (Overpass API, koko Suomi).
- Päivittyy kerran kuussa GitHub Actionsissa (`.github/workflows/karttapaikat.yml`), joka avaa muutoksista PR:n.
  Tarkista PR:ssä luokkien määrät ja muutosten koko ennen yhdistämistä.
- Sovellus lataa tiedoston vasta Kartassa. Etäisyydet lasketaan laitteessa; sijaintia ei lähetetä minnekään.
- Kentät (rivi = taulukko): luokka (`h` huoltoasema, `k` korjaamo, `l` latauspiste), lat, lon, nimi, ketju,
  osoite, aukiolo (OSM:n opening_hours), puhelin, www. Tyhjät kentät lopusta puuttuvat.
- Tyhjä `paikat`-lista tarkoittaa, että aineistoa ei ole vielä haettu; silloin Kartta ei näytä paikkoja.
