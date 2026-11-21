#!/usr/bin/env python3
"""Rakentaa Kartan paikka-aineiston (huoltoasemat, korjaamot, latauspisteet) OpenStreetMapista.

Käyttö:  python3 tyokalut/karttapaikat.py            (hakee Overpassista ja kirjoittaa kartta-data/paikat.json)
         python3 tyokalut/karttapaikat.py --tiedosto vastaus.json   (rakentaa tallennetusta Overpass-vastauksesta)

Aineisto: © OpenStreetMap-tekijät, ODbL 1.0 (https://www.openstreetmap.org/copyright). Tulos on ODbL-aineisto.
Haku tehdään kerran kuussa GitHub Actionsissa (.github/workflows/karttapaikat.yml), joka avaa muutoksista PR:n.
Sovellus ei koskaan hae Overpassista käyttäjän laitteelta: sijainti ei lähde laitteelta (GPS-suunnitelma, luku 3.5).

Turvarajat: tuntematon tai puutteellinen vastaus ei korvaa vanhaa aineistoa (määrät tarkistetaan ja verrataan
edelliseen versioon), joten osittainen Overpass-vastaus ei voi tyhjentää karttaa.
"""
import argparse
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

JUURI = Path(__file__).resolve().parent.parent
KOHDE = JUURI / "kartta-data" / "paikat.json"
OVERPASS = "https://overpass-api.de/api/interpreter"
KYSELY = """[out:json][timeout:240];
area["ISO3166-1"="FI"][admin_level=2]->.fi;
(
  nwr["amenity"="fuel"](area.fi);
  nwr["shop"="car_repair"](area.fi);
  nwr["amenity"="charging_station"](area.fi);
);
out center tags;"""
# Luokka: (tunnus aineistossa, OSM-tagi, arvo). Järjestys ratkaisee, jos kohteella on useampi tagi.
LUOKAT = [("h", "amenity", "fuel"), ("k", "shop", "car_repair"), ("l", "amenity", "charging_station")]
# Järkevät määrät Suomessa (marraskuu 2026, arvio). Selvästi pienempi määrä tarkoittaa puutteellista vastausta.
VAHINTAAN = {"h": 800, "k": 800, "l": 800}
SUURIN_PUDOTUS = 0.2  # yli 20 % pudotus luokassa edelliseen versioon → ei korvata
PITUUS = 120


def teksti(arvo):
    if not isinstance(arvo, str):
        return ""
    arvo = " ".join(arvo.split())
    return arvo[:PITUUS]


def verkko(arvo):
    arvo = teksti(arvo)
    return arvo if arvo.startswith(("https://", "http://")) and " " not in arvo else ""


def rivi(el):
    t = el.get("tags") or {}
    luokka = next((k for k, avain, arvo in LUOKAT if t.get(avain) == arvo), None)
    if not luokka:
        return None
    if t.get("access") in ("private", "no") or t.get("disused") == "yes":
        return None
    lat = el.get("lat", (el.get("center") or {}).get("lat"))
    lon = el.get("lon", (el.get("center") or {}).get("lon"))
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        return None
    if not (59.0 <= lat <= 70.5 and 19.0 <= lon <= 32.0):  # Suomen alue väljästi
        return None
    nimi = teksti(t.get("name"))
    ketju = teksti(t.get("brand") or t.get("operator"))
    if ketju == nimi:
        ketju = ""
    katu = " ".join(x for x in (teksti(t.get("addr:street")), teksti(t.get("addr:housenumber"))) if x)
    osoite = ", ".join(x for x in (katu, teksti(t.get("addr:city"))) if x)
    aukiolo = teksti(t.get("opening_hours"))
    puhelin = teksti(t.get("phone") or t.get("contact:phone"))
    www = verkko(t.get("website") or t.get("contact:website"))
    r = [luokka, round(lat, 5), round(lon, 5), nimi, ketju, osoite, aukiolo, puhelin, www]
    while r and r[-1] == "":  # tyhjät kentät lopusta pois (pienempi tiedosto)
        r.pop()
    return r


def rakenna(vastaus):
    paikat, nahty = [], set()
    for el in vastaus.get("elements", []):
        r = rivi(el)
        if not r:
            continue
        avain = (r[0], r[1], r[2], r[3] if len(r) > 3 else "")
        if avain in nahty:  # sama kohde sekä pisteenä että alueena
            continue
        nahty.add(avain)
        paikat.append(r)
    paikat.sort(key=lambda r: (r[0], r[1], r[2], r[3] if len(r) > 3 else ""))
    return paikat


def maarat(paikat):
    m = {k: 0 for k, _, _ in LUOKAT}
    for r in paikat:
        m[r[0]] += 1
    return m


def tarkista(paikat, vanha):
    m = maarat(paikat)
    for k, minimi in VAHINTAAN.items():
        if m[k] < minimi:
            raise SystemExit(f"Liian vähän kohteita luokassa {k}: {m[k]} < {minimi}. Vanhaa aineistoa ei korvata.")
    if vanha:
        vm = maarat(vanha.get("paikat", []))
        for k in m:
            if vm.get(k) and m[k] < vm[k] * (1 - SUURIN_PUDOTUS):
                raise SystemExit(f"Luokka {k} pieneni {vm[k]} → {m[k]} (yli {int(SUURIN_PUDOTUS * 100)} %). Vanhaa aineistoa ei korvata.")
    return m


def kirjoita(paikat, aika):
    meta = {"versio": 1, "haettu": aika, "lahde": "OpenStreetMap (Overpass API)",
            "lisenssi": "© OpenStreetMap-tekijät, ODbL 1.0, https://www.openstreetmap.org/copyright",
            "luokat": {"h": "Huoltoasema", "k": "Korjaamo", "l": "Latauspiste"},
            "kentat": ["luokka", "lat", "lon", "nimi", "ketju", "osoite", "aukiolo", "puhelin", "www"]}
    rivit = ",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in paikat)
    KOHDE.parent.mkdir(exist_ok=True)
    KOHDE.write_text('{"meta":' + json.dumps(meta, ensure_ascii=False, separators=(",", ":")) + ',"paikat":[\n' + rivit + "\n]}\n", encoding="utf-8")


def hae():
    data = urllib.parse.urlencode({"data": KYSELY}).encode()
    pyynto = urllib.request.Request(OVERPASS, data=data, headers={"User-Agent": "ajoura-karttapaikat/1 (github.com/Ajoura-app)"})
    with urllib.request.urlopen(pyynto, timeout=300) as v:
        return json.load(v)


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--tiedosto", help="tallennettu Overpass-vastaus (JSON)")
    args = a.parse_args()
    vastaus = json.loads(Path(args.tiedosto).read_text(encoding="utf-8")) if args.tiedosto else hae()
    if vastaus.get("remark"):
        raise SystemExit("Overpass palautti huomautuksen (aikakatkaisu tai muistiraja): " + teksti(vastaus["remark"]))
    paikat = rakenna(vastaus)
    vanha = json.loads(KOHDE.read_text(encoding="utf-8")) if KOHDE.exists() else None
    m = tarkista(paikat, vanha)
    if vanha and vanha.get("paikat") == paikat:
        print("Ei muutoksia.", m)
        return
    aika = (vastaus.get("osm3s") or {}).get("timestamp_osm_base") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    kirjoita(paikat, aika)
    print("Kirjoitettu", KOHDE.relative_to(JUURI), m, f"{KOHDE.stat().st_size // 1024} kt")


if __name__ == "__main__":
    sys.exit(main())
