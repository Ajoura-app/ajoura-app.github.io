"""Tankkausmittarin ja auton mittariston tunnistus (v1.19): tankkausikkunan painikkeet Tankkausmittari ja Mittaristo.
Kuva pienennetään laitteessa, lähtee vain AjouraAccess.recognize-reitin kautta (oma ominaisuus ai.pump / ai.odometer,
yhteinen kiintiö), ja tulos vain esitäyttää lomakkeen: käyttäjä tarkistaa ja tallentaa itse.

Tekoälyfunktio ja Supabase ovat keksittyjä (test_plus.palvelu): oikeaan Anthropiciin ei oteta yhteyttä.
"""
import pytest
from PIL import Image

import tiedot
from apu import KELLO, avaa, ikkuna_valmis
from test_plus import PLUS, palvelu

PUMPPU = {"is_pump": True, "quantity": 45.6, "unit": "l", "price_per_unit": 1.859, "total": 84.77, "currency": None,
          "fuel": "95E10", "mismatch": False}
MITTARI = {"is_odometer": True, "odometer": 153100, "unit": "km"}
EDELLINEN_KM = tiedot.talli()[0]["fuels"][-1]["km"]  # 152400
LUETTELO_ILMAN_MITTARIA = {**PLUS, "features": ["ai.receipt", "ai.odometer", "ai.servicebook"]}  # palvelin ennen ai.pump-migraatiota


@pytest.fixture(scope="module")
def kuva(tmp_path_factory):
    """Iso keksitty kuva (3000 × 2000 px), jotta pienennys näkyy."""
    p = tmp_path_factory.mktemp("mittari") / "mittari.jpg"
    Image.new("RGB", (3000, 2000), (30, 30, 35)).save(p, "JPEG", quality=95)
    return p


def avaa_plus(browser, base, reitti="fuel/tst1", oikeus=PLUS, tekoaly="1", **k):
    s = avaa(browser, base, reitti, autot=tiedot.talli(), kello=KELLO, extra={"ajoura-tekoaly": tekoaly}, **k)
    return s, palvelu(s, oikeus=oikeus)


def ikkuna(s):
    s.page.click(".fl-add")
    ikkuna_valmis(s.page)


def viesti(pg, teksti):
    pg.wait_for_function("t => document.querySelector('.sf-ai-note').textContent.includes(t)", arg=teksti)


def kentat(pg):
    return {n: pg.input_value(f"#quickfuel-form [name={n}]") for n in ("km", "qty", "ppu", "cost", "date")}


@pytest.mark.parametrize("reitti,oikeus,tekoaly,pumppu,mittaristo", [
    ("fuel/tst1", PLUS, "1", True, True),            # henkilöauto: molemmat
    ("fuel/tst2", PLUS, "1", False, True),           # sähköauto: ei tankkausmittaria
    ("fuel/tst3", PLUS, "1", True, False),           # vene (tunnit): ei kilometrimittaria
    ("fuel/tst1", LUETTELO_ILMAN_MITTARIA, "1", False, True),  # palvelin ei vielä salli ai.pump
    ("fuel/tst1", PLUS, "0", False, False),          # tekoäly pois: ei kumpaakaan
])
def test_painikkeet_nakyvat_vain_kun_sopii(browser, base, reitti, oikeus, tekoaly, pumppu, mittaristo):
    s, _ = avaa_plus(browser, base, reitti, oikeus, tekoaly)
    try:
        ikkuna(s)
        assert (s.page.locator("[data-ai-pump]").count() == 1) is pumppu, "tankkausmittari"
        assert (s.page.locator("[data-ai-odo]").count() == 1) is mittaristo, "mittaristo"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_painikkeet_eivat_nay_muokatessa(browser, base):
    s, _ = avaa_plus(browser, base)
    try:
        ikkuna(s)
        s.page.keyboard.press("Escape")
        s.page.locator("[data-fl-edit]").first.click()
        ikkuna_valmis(s.page)
        assert s.page.locator("[data-ai-pump], [data-ai-odo], [data-ai-scan]").count() == 0
    finally:
        s.sulje()


def test_tankkausmittari_esitayttaa_lomakkeen(browser, base, kuva):
    s, tila = avaa_plus(browser, base)
    try:
        tila["ai_vastaus"] = PUMPPU
        pg = s.page
        ennen, talli = None, s.talli()
        ikkuna(s)
        ennen = kentat(pg)
        pg.set_input_files("[data-ai-file-pump]", str(kuva))
        viesti(pg, "Tarkista ne")
        k = kentat(pg)
        assert k["qty"] == "45,60" and k["cost"] == "84,77"
        assert abs(float(k["ppu"].replace(",", ".")) - 1.859) < 0.001, k
        assert k["date"] == ennen["date"] and k["km"] == ennen["km"], "mittari ei saa muuttaa päivää eikä kilometrejä"
        assert "tankkausmittarista" in pg.inner_text(".sf-ai-note")
        assert pg.evaluate("document.activeElement.name") == "km"
        # Kuva lähti pienennettynä JPEG:nä, vain omaan ominaisuuteensa; mitään ei tallennettu.
        assert tila["ai"] == ["ai.pump"]
        assert tila["ai_pyynnot"][0]["tyyppi"] == "image/jpeg"
        assert 0 < tila["ai_pyynnot"][0]["koko"] < kuva.stat().st_size
        assert s.talli() == talli
        # Painikkeet ovat taas käytössä.
        assert not pg.locator("[data-ai-scan], [data-ai-pump], [data-ai-odo]").evaluate_all("els => els.some(e => e.disabled)")
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
    ("ei-mittari", {**PUMPPU, "is_pump": False}, 200, "ei löytynyt tankkausmittarin lukemia", []),
    ("yksikko", {**PUMPPU, "unit": "kWh"}, 200, "yksikkö ei vastaa", ["cost"]),
    ("valuutta", {**PUMPPU, "currency": "SEK"}, 200, "ei ole euroissa", ["qty"]),
    ("tyhja", {**PUMPPU, "quantity": None, "price_per_unit": None, "total": None}, 200, "ei saatu määrää eikä hintaa", []),
    ("kiintio", {}, 429, "Tämän kuun tunnistukset on käytetty", []),
    ("palvelin", {}, 502, "Tankkausmittaria ei voitu lukea nyt", []),
])
def test_tankkausmittari_virheet_ja_poikkeukset(browser, base, kuva, tapaus, vastaus, status, teksti, taytetty):
    s, tila = avaa_plus(browser, base)
    try:
        tila["ai_vastaus"], tila["ai_status"] = vastaus, status
        ikkuna(s)
        s.page.set_input_files("[data-ai-file-pump]", str(kuva))
        viesti(s.page, teksti)
        for n in ("qty", "ppu", "cost"):
            arvo = s.page.input_value(f"#quickfuel-form [name={n}]")
            assert bool(arvo) == (n in taytetty), (tapaus, n, arvo)
        assert not s.page.locator("[data-ai-pump]").is_disabled()
    finally:
        s.sulje()


def test_mittaristo_taytaa_kilometrit(browser, base, kuva):
    s, tila = avaa_plus(browser, base)
    try:
        tila["ai_vastaus"] = MITTARI
        pg = s.page
        talli = s.talli()
        ikkuna(s)
        pg.set_input_files("[data-ai-file-odo]", str(kuva))
        viesti(pg, "Kilometrilukema luettu")
        assert pg.input_value("#quickfuel-form [name=km]") == "153100"
        # Syötetapahtuma lähti: "edellisestä tankkauksesta" -ero päivittyi (153100 - 152400 = 700).
        assert "700" in pg.inner_text(".sf-gap")
        assert pg.evaluate("document.activeElement.name") == "km"
        assert tila["ai"] == ["ai.odometer"]
        assert tila["ai_pyynnot"][0]["tyyppi"] == "image/jpeg"
        assert 0 < tila["ai_pyynnot"][0]["koko"] < kuva.stat().st_size
        assert s.talli() == talli, "mittaristo ei saa tallentaa mitään"
        for n in ("qty", "ppu", "cost"):
            assert pg.input_value(f"#quickfuel-form [name={n}]") == "", "mittaristo ei täytä määrää eikä hintaa"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("tapaus,vastaus,status,teksti,km", [
    ("pienempi", {**MITTARI, "odometer": 150000}, 200, "pienempi kuin edellisessä tankkauksessa", "150000"),
    ("mailit", {**MITTARI, "unit": "mi"}, 200, "näyttää maileja", str(EDELLINEN_KM)),
    ("ei-mittaristo", {"is_odometer": False, "odometer": None, "unit": None}, 200, "ei saatu luettua kokonaiskilometrejä", str(EDELLINEN_KM)),
    ("tyhja", {**MITTARI, "odometer": None}, 200, "ei saatu luettua kokonaiskilometrejä", str(EDELLINEN_KM)),
    ("kiintio", {}, 429, "Tämän kuun tunnistukset on käytetty", str(EDELLINEN_KM)),
    ("palvelin", {}, 502, "Mittaristoa ei voitu lukea nyt", str(EDELLINEN_KM)),
])
def test_mittaristo_virheet_ja_poikkeukset(browser, base, kuva, tapaus, vastaus, status, teksti, km):
    s, tila = avaa_plus(browser, base)
    try:
        tila["ai_vastaus"], tila["ai_status"] = vastaus, status
        ikkuna(s)
        ennen = s.page.input_value("#quickfuel-form [name=km]")
        s.page.set_input_files("[data-ai-file-odo]", str(kuva))
        viesti(s.page, teksti)
        # Ilman kelvollista lukemaa kilometrikenttä pysyy ennallaan; "pienempi" täytetään ja varoitetaan.
        odotettu = km if tapaus == "pienempi" else ennen
        assert s.page.input_value("#quickfuel-form [name=km]") == odotettu, tapaus
        assert not s.page.locator("[data-ai-odo]").is_disabled()
    finally:
        s.sulje()


def test_tekoaly_pois_ei_laheta_mitaan(browser, base):
    """Tekoäly pois: ei painikkeita, ja suora tunnistuskutsu torjutaan ennen verkkoa (oikeus tarkistetaan ensin)."""
    s, tila = avaa_plus(browser, base, tekoaly="0")
    try:
        tila["ai_vastaus"] = MITTARI
        for f in ("ai.pump", "ai.odometer"):
            r = s.page.evaluate("f => AjouraAccess.recognize(f, new Blob(['x'], {type: 'image/jpeg'})).then(() => 'ok', e => e.reason)", f)
            assert r == "off", (f, r)
        s.page.wait_for_timeout(200)
        assert tila["ai"] == []
    finally:
        s.sulje()


@pytest.mark.parametrize("kieli,pumppu,mittaristo,valmis", [
    ("fi", "Tankkausmittari", "Mittaristo", "Tarkista ne"),
    ("en", "Fuel pump", "Dashboard", "Check them"),
    ("sv", "Bränslepump", "Instrumentpanel", "Kontrollera dem"),
])
def test_kolme_kielta_ja_kapea_nayttö(browser, base, kuva, kieli, pumppu, mittaristo, valmis):
    s = avaa(browser, base, "fuel/tst1", autot=tiedot.talli(), kello=KELLO, kieli=kieli, leveys=320, korkeus=640,
             extra={"ajoura-tekoaly": "1"})
    try:
        tila = palvelu(s)
        tila["ai_vastaus"] = PUMPPU
        ikkuna(s)
        teksti = s.page.inner_text(".sf-ai")
        assert pumppu in teksti and mittaristo in teksti, teksti
        # Kapealla näytöllä painikkeet mahtuvat arkin sisään ja ovat vähintään 44 px korkeita.
        laatikot = s.page.evaluate("""() => { const sh = document.querySelector('.sheet').getBoundingClientRect();
            return [...document.querySelectorAll('.sf-ai-btn')].map(b => { const r = b.getBoundingClientRect();
              return { h: r.height, ok: r.left >= sh.left - 0.5 && r.right <= sh.right + 0.5 }; }); }""")
        assert len(laatikot) == 3 and all(x["ok"] and x["h"] >= 44 for x in laatikot), laatikot
        s.page.set_input_files("[data-ai-file-pump]", str(kuva))
        viesti(s.page, valmis)
        assert s.page.evaluate("document.querySelector('.sheet').scrollWidth <= document.querySelector('.sheet').clientWidth")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
