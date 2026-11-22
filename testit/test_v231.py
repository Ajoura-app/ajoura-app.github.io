"""2.31 (GPS-suunnitelman vaihe 2c): lähimmät huoltoasemat, korjaamot ja latauspisteet.

- tyokalut/karttapaikat.py rakentaa aineiston Overpass-vastauksesta (keksitty vastaus, ei verkkoa) ja hylkää
  puutteellisen vastauksen; GitHub Actions -työnkulku avaa muutoksista PR:n.
- Kartta: sirut (yksi luokka kerrallaan), pisteet kartalla, lähimpien lista kartan keskeltä tai omasta sijainnista,
  tiedot ja Navigoi (Apple Kartat iPhonessa, muuten Google Maps). Mitään sijaintia ei lähetetä.
- Tyhjä aineisto (ennen ensimmäistä päivitystä): ei siruja eikä virheitä.
Testiaineisto (testit/fixtures/karttapaikat.json) on keksitty.
"""
import json
import re
import sys
from pathlib import Path

import pytest

from apu import avaa
from test_v225 import odota_tila, tyyli
import tiedot

JUURI = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(JUURI / "tyokalut"))
import karttapaikat  # noqa: E402

AINEISTO = (Path(__file__).parent / "fixtures" / "karttapaikat.json").read_text(encoding="utf-8")
KESKI = {"lng": 22.84, "lat": 62.79, "zoom": 12.5}


# ---- Aineiston rakennus ----
def el(tyyppi, i, tags, lat=62.79, lon=22.84):
    e = {"type": tyyppi, "id": i, "tags": tags}
    if tyyppi == "node":
        e.update(lat=lat, lon=lon)
    else:
        e["center"] = {"lat": lat, "lon": lon}
    return e


def test_rakennus_suodattaa_ja_jarjestaa():
    v = {"elements": [
        el("node", 1, {"amenity": "fuel", "name": "  Asema   Yksi ", "brand": "Ketju", "addr:street": "Katu", "addr:housenumber": "1", "addr:city": "Kaupunki",
                       "opening_hours": "24/7", "phone": "+358 1", "website": "https://esimerkki.test"}),
        el("way", 2, {"shop": "car_repair", "name": "Korjaamo", "website": "javascript:alert(1)"}, 62.5, 23.0),
        el("node", 3, {"amenity": "charging_station", "access": "private"}),            # yksityinen pois
        el("node", 4, {"amenity": "fuel", "name": "Ulkomailla"}, 52.5, 13.4),            # Suomen ulkopuolella pois
        el("node", 5, {"amenity": "fuel", "disused": "yes"}),                            # käytöstä poistettu pois
        el("way", 6, {"amenity": "fuel", "name": "  Asema   Yksi ", "brand": "Ketju"}),  # sama paikka alueena: kerran
        el("node", 7, {"amenity": "restaurant", "name": "Ei kuulu"}),
        el("node", 8, {"amenity": "charging_station", "operator": "Lataaja"}, 61.0, 25.0),
    ]}
    p = karttapaikat.rakenna(v)
    assert p == [["h", 62.79, 22.84, "Asema Yksi", "Ketju", "Katu 1, Kaupunki", "24/7", "+358 1", "https://esimerkki.test"],
                 ["k", 62.5, 23.0, "Korjaamo"],
                 ["l", 61.0, 25.0, "", "Lataaja"]]


def test_puutteellinen_vastaus_ei_korvaa(monkeypatch):
    monkeypatch.setattr(karttapaikat, "VAHINTAAN", {"h": 2, "k": 1, "l": 1})
    p = [["h", 60, 25], ["h", 61, 25], ["k", 60, 24], ["l", 60, 23]]
    assert karttapaikat.tarkista(p, None) == {"h": 2, "k": 1, "l": 1}
    with pytest.raises(SystemExit):
        karttapaikat.tarkista(p[1:], None)  # liian vähän huoltoasemia
    vanha = {"paikat": [["h", 60, 25 + i / 100] for i in range(10)] + [["k", 60, 24], ["l", 60, 23]]}
    with pytest.raises(SystemExit):
        karttapaikat.tarkista(p, vanha)  # 10 → 2 huoltoasemaa: yli 20 % pudotus


def test_tyonkulku():
    y = (JUURI / ".github" / "workflows" / "karttapaikat.yml").read_text(encoding="utf-8")
    assert "schedule:" in y and "workflow_dispatch:" in y
    assert "python tyokalut/karttapaikat.py" in y and "gh pr create --base main" in y
    assert "secrets." not in y  # ei salaisuuksia; vain GitHubin oma tunnus PR:ää varten
    assert "git push origin \"$haara\"" in y and "main" not in y.split("git push")[1].split("\n")[0]  # ei suoraan mainiin


def test_repon_aineisto_kelpaa():
    d = json.loads((JUURI / "kartta-data" / "paikat.json").read_text(encoding="utf-8"))
    assert d["meta"]["versio"] == 1 and "ODbL" in d["meta"]["lisenssi"]
    for r in d["paikat"]:
        assert r[0] in "hkl" and 59 <= r[1] <= 70.5 and 19 <= r[2] <= 32 and len(r) <= 9


# ---- Kartta ----
def kartta(browser, base, aineisto=AINEISTO, keski=KESKI, **k):
    extra = {"ajoura-kartta-nakyma": json.dumps(keski)}
    extra.update(k.pop("extra", {}))
    s = avaa(browser, base, "home", autot=tiedot.talli(), extra=extra, **k)
    pyynnot = []
    s.page.on("request", lambda r: pyynnot.append(r.url))
    if aineisto is not None:
        s.page.route(base + "/kartta-data/paikat.json", lambda r: r.fulfill(status=200, content_type="application/json", body=aineisto))
    tyyli(s)
    s.page.locator('.main-tabs a[aria-label="Kartta"]').click()
    odota_tila(s, "ready")
    return s, pyynnot


def lista(p):
    return p.evaluate("""() => [...document.querySelectorAll('.kartta-lista-rivit button')].map(b =>
      [b.querySelector('strong').textContent, b.querySelector('.kartta-rivi-matka').textContent])""")


def test_tyhja_aineisto_ei_nayta_siruja(browser, base):
    # Tyhjä pohja (ennen ensimmäistä aineistohakua; repossa on nyt oikea aineisto, PR #34).
    tyhja = json.dumps({"meta": json.loads(AINEISTO)["meta"], "paikat": []})
    s, _ = kartta(browser, base, aineisto=tyhja)
    try:
        s.page.wait_for_function("AjouraKartta.paikat() === 'tyhja'")
        assert s.page.locator(".kartta-sirut").is_hidden()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_lahimmat_kartan_keskelta(browser, base):
    s, pyynnot = kartta(browser, base)
    try:
        p = s.page
        p.wait_for_function("AjouraKartta.paikat() === 'ok'")
        assert p.locator(".kartta-sirut").is_visible()
        assert p.evaluate("[...document.querySelectorAll('[data-paikka-luokka]')].map(b => b.textContent + ':' + b.getAttribute('aria-pressed'))") == \
            ["Huoltoasemat:false", "Korjaamot:false", "Latauspisteet:false"]
        assert p.locator(".kartta-lista").is_hidden()
        p.locator('[data-paikka-luokka="h"]').click()
        assert p.locator('[data-paikka-luokka="h"]').get_attribute("aria-pressed") == "true"
        assert p.locator(".kartta-lista h3").inner_text() == "Lähimmät huoltoasemat"
        assert p.locator(".kartta-lista-lahto").first.inner_text() == "Linnuntie kartan keskeltä"
        # Järjestys etäisyyden mukaan; nimetön asema näkyy ketjun nimellä.
        assert lista(p) == [["Testiasema Keskusta", "520 m"], ["Testiasema Pohjoinen", "560 m"], ["Testiketju", "1,2 km"], ["Testiasema Kaukana", "5,4 km"]]
        assert p.evaluate("localStorage.getItem('ajoura-kartta-paikat')") == "h"
        # Luokan vaihto.
        p.locator('[data-paikka-luokka="l"]').click()
        assert [r[0] for r in lista(p)] == ["Testilatauspiste", "Testilatauspiste Kaukana"]
        # Tiedot ja Navigoi (Google Maps muualla kuin iPhonessa).
        p.locator('[data-paikka-luokka="h"]').click()
        p.locator('[data-paikka="1"]').click()
        assert p.locator(".kartta-kohde-nimi").inner_text() == "Testiasema Pohjoinen"
        teksti = " ".join(p.locator(".kartta-lista").inner_text().split())
        assert "Testiketju · Huoltoasema · 560 m linnuntietä" in teksti
        assert "Aukiolo ma-pe 06:00-22:00; la,su 08:00-22:00" in teksti
        nav = p.locator("[data-navigoi]")
        assert nav.get_attribute("href") == "https://www.google.com/maps/dir/?api=1&destination=62.795,22.84&travelmode=driving"
        assert nav.get_attribute("target") == "_blank" and nav.get_attribute("rel") == "noopener"
        assert p.locator('.kartta-lista a[href="tel:+358400000001"]').count() == 1
        assert p.locator('.kartta-lista a[href="https://esimerkki.test/asema"]').count() == 1
        p.locator("[data-paikat-takaisin]").click()
        assert len(lista(p)) == 4
        # Sulje: lista pois, pisteet (luokka) jäävät; luokan uusi painallus poistaa valinnan.
        p.locator("[data-paikat-sulje]").click()
        assert p.locator(".kartta-lista").is_hidden() and p.locator('[data-paikka-luokka="h"]').get_attribute("aria-pressed") == "true"
        p.locator('[data-paikka-luokka="h"]').click()
        assert p.locator('[data-paikka-luokka="h"]').get_attribute("aria-pressed") == "false" and p.locator(".kartta-lista").is_hidden()
        assert p.evaluate("localStorage.getItem('ajoura-kartta-paikat')") is None
        # Ei yhtään pyyntöä Overpassiin tai muualle sijainnin kanssa.
        assert not [u for u in pyynnot if "overpass" in u or "62.79" in u]
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_omasta_sijainnista_ja_iphone(browser, base):
    s, _ = kartta(browser, base, ios=True)
    try:
        p = s.page
        s.context.grant_permissions(["geolocation"], origin=base)
        s.context.set_geolocation({"latitude": 62.70, "longitude": 22.70})  # etelässä, lähellä "Kaukana"-latauspistettä
        p.wait_for_function("AjouraKartta.paikat() === 'ok'")
        p.locator('[data-paikka-luokka="l"]').click()
        assert [r[0] for r in lista(p)] == ["Testilatauspiste", "Testilatauspiste Kaukana"]
        p.locator("[data-kartta-sijainti]").click()
        p.wait_for_function("document.querySelector('.kartta-lista-lahto')?.textContent === 'Linnuntie sijainnistasi'")
        assert [r[0] for r in lista(p)] == ["Testilatauspiste Kaukana", "Testilatauspiste"]
        p.locator('[data-paikka="0"]').click()
        assert p.locator("[data-navigoi]").get_attribute("href") == "https://maps.apple.com/?daddr=62.7,22.7&dirflg=d"
    finally:
        s.sulje()


def test_pisteen_napautus_avaa_tiedot(browser, base):
    s, _ = kartta(browser, base, keski={"lng": 22.83, "lat": 62.791, "zoom": 15}, extra={"ajoura-kartta-paikat": "h"})
    try:
        p = s.page
        p.wait_for_function("AjouraKartta.paikat() === 'ok'")
        assert p.locator('[data-paikka-luokka="h"]').get_attribute("aria-pressed") == "true"  # valinta muistetaan
        assert p.locator(".kartta-lista").is_hidden()
        p.wait_for_timeout(500)
        b = p.locator(".kartta-map").bounding_box()
        p.mouse.click(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
        p.wait_for_selector(".kartta-kohde-nimi")
        assert p.locator(".kartta-kohde-nimi").inner_text() == "Testiasema Keskusta"
    finally:
        s.sulje()


def test_haitallinen_ja_rikkinainen_aineisto(browser, base):
    d = json.loads(AINEISTO)
    d["paikat"] = [["h", 62.791, 22.84, "<img src=x onerror=window.__xss=1>", "", "<b>katu</b>", "Mo-Fr 08:00-16:00", "", "javascript:alert(1)"],
                   ["x", 62.79, 22.84, "Väärä luokka"], ["h", "62.7", 22.84, "Väärä koordinaatti"], "ei taulukko"]
    s, _ = kartta(browser, base, aineisto=json.dumps(d))
    try:
        p = s.page
        p.wait_for_function("AjouraKartta.paikat() === 'ok'")
        p.locator('[data-paikka-luokka="h"]').click()
        assert lista(p) == [["<img src=x onerror=window.__xss=1>", "110 m"]]
        p.locator('[data-paikka="0"]').click()
        assert p.evaluate("window.__xss") is None
        assert p.locator(".kartta-lista img, .kartta-lista b").count() == 0
        assert p.locator('.kartta-lista a[href^="javascript"]').count() == 0
    finally:
        s.sulje()


@pytest.mark.parametrize("teema", [None, "dark"])
def test_kapea_puhelin(browser, base, teema):
    s, _ = kartta(browser, base, leveys=320, korkeus=568, teema=teema)
    try:
        p = s.page
        p.wait_for_function("AjouraKartta.paikat() === 'ok'")
        p.locator('[data-paikka-luokka="h"]').click()
        r = p.evaluate("""() => {const b = s => document.querySelector(s).getBoundingClientRect(), l = b('.kartta-lista'), nav = b('#app-screen > .tab-dock .tab-bar'),
          z = b('.kartta-zoom'), rivit = [...document.querySelectorAll('.kartta-lista-rivit button')].map(x => x.getBoundingClientRect().height),
          koko = [...document.querySelectorAll('.kartta-lista small, .kartta-lista-lahto, .kartta-siru')].map(x => parseFloat(getComputedStyle(x).fontSize)),
          sirut = [...document.querySelectorAll('.kartta-siru')].map(x => x.getBoundingClientRect()), ylanapit = b('.kartta-ylanapit');
          return {listaAla: l.bottom, navYla: nav.top, zoomAla: z.bottom, listaYla: l.top, rivit, koko, leveys: innerWidth,
                  sirutAla: Math.max(...sirut.map(x => x.bottom)), napitYla: ylanapit.top};}""")
        assert r["listaAla"] <= r["navYla"] and r["zoomAla"] <= r["listaYla"], r
        assert min(r["rivit"]) >= 44 and min(r["koko"]) >= 11, r
        assert r["sirutAla"] <= r["napitYla"], r  # sirut eivät osu tasopainikkeeseen
        assert p.evaluate("document.documentElement.scrollWidth <= innerWidth")
    finally:
        s.sulje()


def test_seloste_kertoo_lahimmista(browser, base):
    s = avaa(browser, base, None, polku="tietosuoja.html", odota=False)
    try:
        s.page.wait_for_load_state("load")
        teksti = " ".join(s.page.inner_text("main").split())
        assert ("Lähimmät paikat: huoltoasemat, korjaamot ja latauspisteet tulevat AJOURAn omalta sivustolta (OpenStreetMap-aineisto, "
                "© OpenStreetMap-tekijät). Etäisyydet lasketaan laitteellasi kartan keskeltä tai, jos olet pyytänyt sen, sijainnistasi. "
                "Sijaintia ei lähetetä minnekään. Navigoi avaa puhelimesi karttasovelluksen (Apple Kartat tai Google Maps), jolle välitetään "
                "valitun paikan sijainti. Sen jälkeen tietoja käsittelee karttasovelluksen tarjoaja omien ehtojensa mukaan.") in teksti
    finally:
        s.sulje()
