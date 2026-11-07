"""Täytä kuvasta (v1.19): tankkausikkunassa on yksi painike, ja tekoäly tunnistaa kuvan lajin itse: kuitti (test_kuitti.py),
tankkausmittarin näyttö tai auton mittaristo. Kuva pienennetään laitteessa, lähtee vain AjouraAccess.recognize-reitin kautta
(ominaisuus ai.receipt, yksi kuukausikiintiö), ja tulos vain esitäyttää lomakkeen: käyttäjä tarkistaa ja tallentaa itse.

Tekoälyfunktio ja Supabase ovat keksittyjä (test_plus.palvelu): oikeaan Anthropiciin ei oteta yhteyttä.
"""
import pytest
from PIL import Image

import tiedot
from apu import KELLO, avaa, ikkuna_valmis
from test_plus import PLUS, palvelu

TYHJA = {"kind": "other", "date": None, "quantity": None, "unit": None, "price_per_unit": None, "total": None,
         "currency": None, "fuel": None, "mismatch": False, "odometer": None, "odometer_unit": None}
PUMPPU = {**TYHJA, "kind": "pump", "quantity": 45.6, "unit": "l", "price_per_unit": 1.859, "total": 84.77, "fuel": "95E10"}
MITTARI = {**TYHJA, "kind": "odometer", "odometer": 153100, "odometer_unit": "km"}
EDELLINEN_KM = tiedot.talli()[0]["fuels"][-1]["km"]  # 152400


@pytest.fixture(scope="module")
def kuva(tmp_path_factory):
    """Iso keksitty kuva (3000 × 2000 px), jotta pienennys näkyy."""
    p = tmp_path_factory.mktemp("mittari") / "mittari.jpg"
    Image.new("RGB", (3000, 2000), (30, 30, 35)).save(p, "JPEG", quality=95)
    return p


def avaa_plus(browser, base, reitti="fuel/tst1", tekoaly="1", **k):
    s = avaa(browser, base, reitti, autot=tiedot.talli(), kello=KELLO, extra={"ajoura-tekoaly": tekoaly}, **k)
    return s, palvelu(s, oikeus=PLUS)


def ikkuna(s):
    s.page.click(".fl-add")
    ikkuna_valmis(s.page)
    # 1.20: tekoälytila avautuu ensin; lomakkeen Täytä kuvasta -painike on Täytä käsin -valinnan takana.
    if s.page.locator("[data-ai-manual]").count():
        s.page.click("[data-ai-manual]")


def viesti(pg, teksti):
    pg.wait_for_function("t => document.querySelector('.sf-ai-note').textContent.includes(t)", arg=teksti)


def kentat(pg):
    return {n: pg.input_value(f"#quickfuel-form [name={n}]") for n in ("km", "qty", "ppu", "cost", "date")}


def laheta(s, tila, vastaus, kuva, status=200):
    tila["ai_vastaus"], tila["ai_status"] = vastaus, status
    s.page.set_input_files("[data-ai-file]", str(kuva))


def test_vain_yksi_painike(browser, base):
    """Kuitille, tankkausmittarille ja mittaristolle ei ole omia painikkeita: yksi painike ja yksi tiedostokenttä."""
    s, _ = avaa_plus(browser, base)
    try:
        ikkuna(s)
        assert s.page.locator(".sf-ai .sf-ai-btn").count() == 1 and s.page.locator("[data-ai-file]").count() == 1
        assert "Täytä kuvasta" in s.page.inner_text(".sf-ai .sf-ai-btn")
        assert "Kuitti, tankkausmittari tai mittaristo" in s.page.inner_text(".sf-ai .sf-ai-btn")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tankkausmittari_esitayttaa_lomakkeen(browser, base, kuva):
    s, tila = avaa_plus(browser, base)
    try:
        pg = s.page
        talli = s.talli()
        ikkuna(s)
        ennen = kentat(pg)
        laheta(s, tila, PUMPPU, kuva)
        viesti(pg, "Tarkista ne")
        k = kentat(pg)
        assert k["qty"] == "45,60" and k["cost"] == "84,77"
        assert abs(float(k["ppu"].replace(",", ".")) - 1.859) < 0.001, k
        assert k["date"] == ennen["date"] and k["km"] == ennen["km"], "mittari ei saa muuttaa päivää eikä kilometrejä"
        assert "tankkausmittarista" in pg.inner_text(".sf-ai-note")
        assert pg.evaluate("document.activeElement.name") == "km"
        # Kuva lähti pienennettynä JPEG:nä, vain yhteen ominaisuuteen; mitään ei tallennettu.
        assert tila["ai"] == ["ai.receipt"]
        assert tila["ai_pyynnot"][0]["tyyppi"] == "image/jpeg"
        assert 0 < tila["ai_pyynnot"][0]["koko"] < kuva.stat().st_size
        assert s.talli() == talli
        assert not pg.locator("[data-ai-scan]").is_disabled()
        # Käyttäjä tallentaa itse.
        pg.fill("#quickfuel-form [name=km]", str(EDELLINEN_KM + 600))
        pg.click("#quickfuel-form [type=submit]")
        pg.wait_for_function("() => !document.querySelector('.sheet-layer')")
        uusi = [x for x in s.talli()["cars"][0]["fuels"] if x["km"] == EDELLINEN_KM + 600]
        assert len(uusi) == 1 and uusi[0]["qty"] == 45.6 and abs(uusi[0]["cost"] - 84.77) < 0.001, uusi
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("tapaus,vastaus,status,teksti,taytetty", [
    ("ristiriita", {**PUMPPU, "mismatch": True}, 200, "eivät täsmää keskenään", []),
    ("yksikko", {**PUMPPU, "unit": "kWh"}, 200, "yksikkö ei vastaa", ["cost"]),
    ("valuutta", {**PUMPPU, "currency": "SEK"}, 200, "ei ole euroissa", ["qty"]),
    ("tyhja", {**PUMPPU, "quantity": None, "price_per_unit": None, "total": None}, 200, "ei saatu määrää eikä hintaa", []),
    ("ei-tunnistettu", TYHJA, 200, "ei löytynyt kuittia, tankkausmittaria eikä mittaristoa", []),
    ("kiintio", {}, 429, "Tämän kuun tunnistukset on käytetty", []),
    ("palvelin", {}, 502, "Kuvaa ei voitu lukea nyt", []),
])
def test_tankkausmittari_virheet_ja_poikkeukset(browser, base, kuva, tapaus, vastaus, status, teksti, taytetty):
    s, tila = avaa_plus(browser, base)
    try:
        ikkuna(s)
        laheta(s, tila, vastaus, kuva, status)
        viesti(s.page, teksti)
        for n in ("qty", "ppu", "cost"):
            arvo = s.page.input_value(f"#quickfuel-form [name={n}]")
            assert bool(arvo) == (n in taytetty), (tapaus, n, arvo)
        assert not s.page.locator("[data-ai-scan]").is_disabled()
    finally:
        s.sulje()


def test_mittaristo_taytaa_kilometrit(browser, base, kuva):
    s, tila = avaa_plus(browser, base)
    try:
        pg = s.page
        talli = s.talli()
        ikkuna(s)
        laheta(s, tila, MITTARI, kuva)
        viesti(pg, "Kilometrilukema luettu mittaristosta")
        assert pg.input_value("#quickfuel-form [name=km]") == "153100"
        # Syötetapahtuma lähti: "edellisestä tankkauksesta" -ero päivittyi (153100 - 152400 = 700).
        assert "700" in pg.inner_text(".sf-gap")
        assert pg.evaluate("document.activeElement.name") == "km"
        assert tila["ai"] == ["ai.receipt"]
        assert tila["ai_pyynnot"][0]["tyyppi"] == "image/jpeg"
        assert 0 < tila["ai_pyynnot"][0]["koko"] < kuva.stat().st_size
        assert s.talli() == talli, "mittaristo ei saa tallentaa mitään"
        for n in ("qty", "ppu", "cost"):
            assert pg.input_value(f"#quickfuel-form [name={n}]") == "", "mittaristo ei täytä määrää eikä hintaa"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("tapaus,vastaus,teksti,km", [
    ("pienempi", {**MITTARI, "odometer": 150000}, "pienempi kuin edellisessä tankkauksessa", "150000"),
    ("mailit", {**MITTARI, "odometer_unit": "mi"}, "näyttää maileja", str(EDELLINEN_KM)),
    ("tyhja", {**MITTARI, "odometer": None}, "ei saatu luettua kokonaiskilometrejä", str(EDELLINEN_KM)),
])
def test_mittaristo_poikkeukset(browser, base, kuva, tapaus, vastaus, teksti, km):
    s, tila = avaa_plus(browser, base)
    try:
        ikkuna(s)
        ennen = s.page.input_value("#quickfuel-form [name=km]")
        laheta(s, tila, vastaus, kuva)
        viesti(s.page, teksti)
        # Ilman kelvollista lukemaa kilometrikenttä pysyy ennallaan; "pienempi" täytetään ja varoitetaan.
        assert s.page.input_value("#quickfuel-form [name=km]") == (km if tapaus == "pienempi" else ennen), tapaus
        assert not s.page.locator("[data-ai-scan]").is_disabled()
    finally:
        s.sulje()


def test_tuntimittarille_ei_taytetä_kilometreja(browser, base, kuva):
    """Veneen mittari on tuntimittari: mittaristokuvan kilometrit eivät mene tuntikenttään."""
    s, tila = avaa_plus(browser, base, "fuel/tst3")
    try:
        ikkuna(s)
        ennen = s.page.input_value("#quickfuel-form [name=km]")
        laheta(s, tila, MITTARI, kuva)
        viesti(s.page, "tuntimittari")
        assert s.page.input_value("#quickfuel-form [name=km]") == ennen
    finally:
        s.sulje()


def test_painike_vain_kun_tekoaly_paalla(browser, base):
    s, tila = avaa_plus(browser, base, tekoaly="0")
    try:
        ikkuna(s)
        assert s.page.locator("[data-ai-scan]").count() == 0
        # Suora tunnistuskutsu torjutaan ennen verkkoa (oikeus tarkistetaan ensin).
        r = s.page.evaluate("AjouraAccess.recognize('ai.receipt', new Blob(['x'], {type: 'image/jpeg'})).then(() => 'ok', e => e.reason)")
        assert r == "off"
        s.page.wait_for_timeout(200)
        assert tila["ai"] == []
    finally:
        s.sulje()


@pytest.mark.parametrize("kieli,painike,valmis", [
    ("fi", "Täytä kuvasta", "Tarkista ne"),
    ("en", "Fill from photo", "Check them"),
    ("sv", "Fyll i från bild", "Kontrollera dem"),
])
def test_kolme_kielta_ja_kapea_naytto(browser, base, kuva, kieli, painike, valmis):
    s = avaa(browser, base, "fuel/tst1", autot=tiedot.talli(), kello=KELLO, kieli=kieli, leveys=320, korkeus=640,
             extra={"ajoura-tekoaly": "1"})
    try:
        tila = palvelu(s)
        ikkuna(s)
        assert painike in s.page.inner_text(".sf-ai")
        r = s.page.evaluate("() => { const sh = document.querySelector('.sheet').getBoundingClientRect(), b = document.querySelector('.sf-ai .sf-ai-btn').getBoundingClientRect();"
                            " return { h: b.height, ok: b.left >= sh.left - 0.5 && b.right <= sh.right + 0.5 }; }")
        assert r["ok"] and r["h"] >= 44, r
        laheta(s, tila, PUMPPU, kuva)
        viesti(s.page, valmis)
        assert s.page.evaluate("document.querySelector('.sheet').scrollWidth <= document.querySelector('.sheet').clientWidth")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
