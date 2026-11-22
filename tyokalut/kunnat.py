#!/usr/bin/env python3
"""Rakentaa Ajopäiväkirjan kuntarajat (kartta-data/kunnat.json) Tilastokeskuksen avoimesta aineistosta.

Käyttö:  python3 tyokalut/kunnat.py                 (hakee geo.stat.fi:stä)
         python3 tyokalut/kunnat.py --tiedosto x.json (rakentaa tallennetusta GeoJSONista)

Aineisto: Tilastokeskus, kunnat 1:4 500 000, CC BY 4.0 (https://www.stat.fi/org/lainsaadanto/copyright.html).
Selain päättelee laitteessa, minkä kunnan alueella ajon lähtö- ja päätepiste on; sijainti ei lähde laitteelta.
Haku tehdään GitHub Actionsissa (.github/workflows/kunnat.yml) kerran vuodessa, ja muutoksista avataan PR.
"""
import argparse
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

JUURI = Path(__file__).resolve().parent.parent
KOHDE = JUURI / "kartta-data" / "kunnat.json"
WFS = "https://geo.stat.fi/geoserver/tilastointialueet/wfs"
TARKKUUS = 3          # desimaalia (~100 m), riittää 1:4,5 milj. aineistolle
MAARA = (250, 340)    # Suomessa 308 kuntaa (2025); tämän ulkopuolella vastaus on puutteellinen


def hae(vuosi):
    q = urllib.parse.urlencode({"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeName": f"tilastointialueet:kunta4500k_{vuosi}",
                                "outputFormat": "application/json", "srsName": "EPSG:4326"})
    with urllib.request.urlopen(urllib.request.Request(f"{WFS}?{q}", headers={"User-Agent": "ajoura-kunnat/1"}), timeout=120) as v:
        return json.load(v)


def rengas(coords, kaanna):
    out = []
    for c in coords:
        x, y = (c[1], c[0]) if kaanna else (c[0], c[1])
        out += [round(x, TARKKUUS), round(y, TARKKUUS)]
    # peräkkäiset samat pisteet pois pyöristyksen jälkeen
    tiivis = out[:2]
    for i in range(2, len(out), 2):
        if out[i:i + 2] != tiivis[-2:]:
            tiivis += out[i:i + 2]
    return tiivis


def rakenna(gj):
    kunnat = []
    for f in gj.get("features", []):
        p = f.get("properties") or {}
        nimi = " ".join(str(p.get("nimi") or "").split())
        g = f.get("geometry") or {}
        polyt = g.get("coordinates") if g.get("type") == "MultiPolygon" else [g.get("coordinates")] if g.get("type") == "Polygon" else []
        if not nimi or not polyt:
            continue
        eka = polyt[0][0][0]
        kaanna = eka[0] > 50  # akselijärjestys lat, lon (WFS 2.0) → lon, lat
        rakenne = [[rengas(r, kaanna) for r in poly] for poly in polyt]
        xs = [v for poly in rakenne for v in poly[0][0::2]]
        ys = [v for poly in rakenne for v in poly[0][1::2]]
        kunnat.append([nimi, [min(xs), min(ys), max(xs), max(ys)], rakenne])
    kunnat.sort(key=lambda k: k[0])
    return kunnat


def tarkista(kunnat):
    if not MAARA[0] <= len(kunnat) <= MAARA[1]:
        raise SystemExit(f"Kuntia {len(kunnat)}, odotettiin {MAARA}. Vanhaa aineistoa ei korvata.")
    for nimi, bb, _ in kunnat:
        if not (19 <= bb[0] <= 32 and 59 <= bb[1] <= 70.5):
            raise SystemExit(f"Kunta {nimi} Suomen ulkopuolella: {bb}")


def main():
    a = argparse.ArgumentParser(); a.add_argument("--tiedosto"); args = a.parse_args()
    if args.tiedosto:
        gj, vuosi = json.loads(Path(args.tiedosto).read_text(encoding="utf-8")), None
    else:
        gj = vuosi = None
        for v in range(datetime.now(timezone.utc).year, datetime.now(timezone.utc).year - 4, -1):
            try:
                gj = hae(v); vuosi = v
                if gj.get("features"):
                    break
            except Exception as e:  # tuntematon vuosi tai tilapäinen virhe: kokeillaan edellistä
                print(f"{v}: {e}")
        if not gj:
            raise SystemExit("Kuntarajoja ei saatu.")
    kunnat = rakenna(gj)
    tarkista(kunnat)
    meta = {"versio": 1, "haettu": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "lahde": f"Tilastokeskus, kunnat 1:4 500 000{f' ({vuosi})' if vuosi else ''}",
            "lisenssi": "CC BY 4.0, Tilastokeskus", "kentat": ["nimi", "bbox [lon,lat,lon,lat]", "monikulmiot [[ulkoreuna, reiät…] flat lon,lat]"]}
    uusi = '{"meta":' + json.dumps(meta, ensure_ascii=False, separators=(",", ":")) + ',"kunnat":[\n' + ",\n".join(json.dumps(k, ensure_ascii=False, separators=(",", ":")) for k in kunnat) + "\n]}\n"
    if KOHDE.exists() and json.loads(KOHDE.read_text(encoding="utf-8")).get("kunnat") == json.loads(uusi)["kunnat"]:
        print("Ei muutoksia.", len(kunnat)); return
    KOHDE.write_text(uusi, encoding="utf-8")
    print("Kirjoitettu", KOHDE.relative_to(JUURI), len(kunnat), "kuntaa", f"{KOHDE.stat().st_size // 1024} kt")


if __name__ == "__main__":
    sys.exit(main())
