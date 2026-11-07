"""Kuittitunnistus (v0.113, Ajoura Plus): tankkausikkunan Täytä kuvasta (v1.19: ennen Täytä kuitista; sama painike lukee myös
tankkausmittarin ja mittariston, ks. test_mittari.py). Kuva pienennetään laitteessa, lähtee vain
AjouraAccess.recognize-reitin kautta, ja tulos vain esitäyttää lomakkeen (käyttäjä tarkistaa ja tallentaa itse).

Tekoälyfunktio ja Supabase ovat keksittyjä (test_plus.palvelu): oikeaan Anthropiciin ei oteta yhteyttä.
"""
import io

import pytest
from PIL import Image

import tiedot
from apu import KELLO, avaa, ikkuna_valmis
from test_plus import palvelu

KUITTI = {"kind": "receipt", "date": "2026-10-28", "quantity": 41.27, "unit": "l", "price_per_unit": 1.889,
          "total": 77.96, "currency": "EUR", "fuel": "Neste Futura 95E10", "mismatch": False, "odometer": None, "odometer_unit": None}


@pytest.fixture(scope="module")
def kuva(tmp_path_factory):
    """Iso keksitty kuitin kuva (3000 × 4000 px), jotta pienennys näkyy."""
    p = tmp_path_factory.mktemp("kuitti") / "kuitti.jpg"
    Image.new("RGB", (3000, 4000), (250, 250, 245)).save(p, "JPEG", quality=95)
    return p


def ikkuna(s):
    s.page.click(".fl-add")
    ikkuna_valmis(s.page)
    # 1.20: tekoälytila avautuu ensin; lomakkeen Täytä kuvasta -painike on Täytä käsin -valinnan takana.
    if s.page.locator("[data-ai-manual]").count():
        s.page.click("[data-ai-manual]")


def avaa_plus(browser, base, tekoaly="1", **k):
    s = avaa(browser, base, "fuel/tst1", autot=tiedot.talli(), kello=KELLO, extra={"ajoura-tekoaly": tekoaly}, **k)
    return s, palvelu(s)


def test_painike_vain_kun_tekoaly_sallittu(browser, base):
    # Free (ei kirjautumista): ei painiketta.
    s = avaa(browser, base, "fuel/tst1", autot=tiedot.talli(), kello=KELLO, extra={"ajoura-tekoaly": "1"})
    try:
        ikkuna(s)
        assert s.page.locator("[data-ai-scan]").count() == 0
    finally:
        s.sulje()
    # Plus, tekoäly pois: ei painiketta.
    s, _ = avaa_plus(browser, base, tekoaly="0")
    try:
        ikkuna(s)
        assert s.page.locator("[data-ai-scan]").count() == 0
    finally:
        s.sulje()
    # Plus, tekoäly päällä: painike uudessa tankkauksessa, ei vanhan muokkauksessa.
    s, _ = avaa_plus(browser, base)
    try:
        ikkuna(s)
        assert s.page.locator("[data-ai-scan]").is_visible()
        s.page.keyboard.press("Escape")
        s.page.locator("[data-fl-edit]").first.click()
        ikkuna_valmis(s.page)
        assert s.page.locator("[data-ai-scan]").count() == 0
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_kuitti_esitayttaa_lomakkeen(browser, base, kuva):
    s, tila = avaa_plus(browser, base)
    try:
        tila["ai_vastaus"] = KUITTI
        pg = s.page
        ennen = s.talli()
        ikkuna(s)
        pg.set_input_files("[data-ai-file]", str(kuva))
        pg.wait_for_function("() => /Tarkista ne/.test(document.querySelector('.sf-ai-note').textContent)")
        f = "#quickfuel-form"
        assert pg.input_value(f + " [name=qty]") == "41,27"
        assert pg.input_value(f + " [name=cost]") == "77,96"
        assert abs(float(pg.input_value(f + " [name=ppu]").replace(",", ".")) - 1.889) < 0.001
        assert pg.input_value(f + " [name=date]") == "2026-10-28"
        assert pg.input_value(f + " [name=grade]") == "95 E10"
        assert pg.evaluate("document.activeElement.name") == "km"
        # Kuva lähti pienennettynä JPEG:nä ja vain tunnistusfunktioon; mitään ei tallennettu.
        assert tila["ai"] == ["ai.receipt"]
        assert tila["ai_pyynnot"][0]["tyyppi"] == "image/jpeg"
        assert 0 < tila["ai_pyynnot"][0]["koko"] < kuva.stat().st_size
        assert s.talli() == ennen
        # Käyttäjä tallentaa itse.
        pg.fill(f + " [name=km]", str(tiedot.talli()[0]["km"] + 600))
        pg.click(f + " [type=submit]")
        pg.wait_for_function("() => !document.querySelector('.sheet-layer')")
        uusi = [x for x in s.talli()["cars"][0]["fuels"] if x["date"] == "2026-10-28"]
        assert len(uusi) == 1 and uusi[0]["qty"] == 41.27 and abs(uusi[0]["cost"] - 77.96) < 0.001, uusi
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("tapaus,vastaus,status,viesti,taytetty", [
    ("kiintio", {}, 429, "Tämän kuun tunnistukset on käytetty", []),
    ("ei-kuitti", {**KUITTI, "kind": "other"}, 200, "ei löytynyt kuittia, tankkausmittaria eikä mittaristoa", []),
    ("valuutta", {**KUITTI, "currency": "SEK", "total": 820.5, "price_per_unit": 19.9}, 200, "ei ole euroissa", ["qty"]),
    ("yksikko", {**KUITTI, "unit": "kWh"}, 200, "yksikkö ei vastaa", ["cost"]),
    ("palvelin", {}, 502, "Kuvaa ei voitu lukea nyt", []),
])
def test_virheet_ja_poikkeukset(browser, base, kuva, tapaus, vastaus, status, viesti, taytetty):
    s, tila = avaa_plus(browser, base)
    try:
        tila["ai_vastaus"], tila["ai_status"] = vastaus, status
        ikkuna(s)
        s.page.set_input_files("[data-ai-file]", str(kuva))
        s.page.wait_for_function("t => document.querySelector('.sf-ai-note').textContent.includes(t)", arg=viesti)
        for n in ("qty", "ppu", "cost"):
            arvo = s.page.input_value(f"#quickfuel-form [name={n}]")
            assert bool(arvo) == (n in taytetty), (tapaus, n, arvo)
        assert not s.page.locator("[data-ai-scan]").is_disabled()
    finally:
        s.sulje()


def test_kaannetty_ja_kapea(browser, base, kuva):
    from test_leveys import MITTAUS
    s = avaa(browser, base, "fuel/tst1", autot=tiedot.talli(), kello=KELLO, kieli="sv", leveys=320, korkeus=640,
             extra={"ajoura-tekoaly": "1"})
    try:
        tila = palvelu(s)
        tila["ai_vastaus"] = KUITTI
        ikkuna(s)
        s.page.set_input_files("[data-ai-file]", str(kuva))
        s.page.wait_for_function("() => /Kontrollera/.test(document.querySelector('.sf-ai-note').textContent)")
        assert "Fyll i från bild" in s.page.inner_text(".sf-ai")
        assert s.page.evaluate("document.querySelector('.sheet').scrollWidth <= document.querySelector('.sheet').clientWidth")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
