"""Tekoälytila (v1.20): uusi tankkaus alkaa tekoälystä, kun tekoäly on käytettävissä. Tila tarjoaa kameran, tekstikentän ja
Täytä käsin -valinnan. Tulos avaa tutun lomakkeen esitäytettynä; käyttäjä tarkistaa ja tallentaa itse. Ilman tekoälyä ja
muokatessa avautuu suoraan lomake. Teksti lähtee JSONina samaan tekoälyfunktioon (ai.receipt, sama kiintiö).

Tekoälyfunktio ja Supabase ovat keksittyjä (test_plus.palvelu): oikeaan Anthropiciin ei oteta yhteyttä.
"""
import json

import pytest
from PIL import Image

import tiedot
from apu import KELLO, TANAAN, avaa, ikkuna_valmis
from test_plus import PLUS, palvelu

TYHJA = {"kind": "other", "date": None, "quantity": None, "unit": None, "price_per_unit": None, "total": None,
         "currency": None, "fuel": None, "mismatch": False, "odometer": None, "odometer_unit": None}
TEKSTI = {**TYHJA, "kind": "text", "date": "2026-10-28", "quantity": 45.6, "unit": "l", "price_per_unit": 1.859,
          "total": 84.77, "currency": "EUR", "fuel": "diesel", "odometer": 153100, "odometer_unit": "km"}
PUMPPU = {**TYHJA, "kind": "pump", "quantity": 45.6, "unit": "l", "price_per_unit": 1.859, "total": 84.77}
EDELLINEN_KM = tiedot.talli()[0]["fuels"][-1]["km"]  # 152400


@pytest.fixture(scope="module")
def kuva(tmp_path_factory):
    p = tmp_path_factory.mktemp("tila") / "kuva.jpg"
    Image.new("RGB", (3000, 2000), (40, 40, 40)).save(p, "JPEG", quality=95)
    return p


def avaa_plus(browser, base, reitti="fuel/tst1", tekoaly="1", **k):
    s = avaa(browser, base, reitti, autot=tiedot.talli(), kello=KELLO, extra={"ajoura-tekoaly": tekoaly}, **k)
    return s, palvelu(s, oikeus=PLUS)


def uusi(s):
    s.page.click(".fl-add")
    ikkuna_valmis(s.page)


def nakyy(pg, sel):
    return pg.locator(sel).first.is_visible()


def tilan_viesti(pg, teksti):
    pg.wait_for_function("t => (document.querySelector('.ai-note')||{}).textContent?.includes(t)", arg=teksti)


def lomakkeen_viesti(pg, teksti):
    pg.wait_for_function("t => (document.querySelector('.sf-ai-note')||{}).textContent?.includes(t)", arg=teksti)


def kirjoita(s, tila, teksti, vastaus, status=200, enter=True):
    tila["ai_vastaus"], tila["ai_status"] = vastaus, status
    s.page.fill("#ai-say-in", teksti)
    if enter:
        s.page.press("#ai-say-in", "Enter")
    else:
        s.page.click("[data-ai-send]")


def test_uusi_tankkaus_avautuu_tekoalytilaan(browser, base):
    s, tila = avaa_plus(browser, base)
    try:
        uusi(s)
        pg = s.page
        assert nakyy(pg, "[data-ai-mode]")
        assert not nakyy(pg, "#quickfuel-form") and not nakyy(pg, ".sf-ai")
        for sel in ("[data-ai-cam]", "#ai-say-in", "[data-ai-send]", "[data-ai-manual]"):
            assert nakyy(pg, sel), sel
        assert pg.evaluate("document.activeElement.hasAttribute('data-ai-cam')"), "kohdistus kamerapainikkeeseen (ei näppäimistöä)"
        assert pg.evaluate("getComputedStyle(document.querySelector('#ai-say-in')).fontSize") == "16px", "iPhone ei suurenna kenttää"
        assert "Täytä käsin" in pg.inner_text("[data-ai-mode]")
        assert tila["ai"] == []
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("tapaus", ["ei-kirjautunut", "tekoaly-pois", "muokkaus"])
def test_ilman_tekoalya_ja_muokatessa_suoraan_lomake(browser, base, tapaus):
    if tapaus == "ei-kirjautunut":
        s = avaa(browser, base, "fuel/tst1", autot=tiedot.talli(), kello=KELLO, extra={"ajoura-tekoaly": "1"})
    else:
        s, _ = avaa_plus(browser, base, tekoaly="0" if tapaus == "tekoaly-pois" else "1")
    try:
        if tapaus == "muokkaus":
            s.page.locator("[data-fl-edit]").first.click()
            ikkuna_valmis(s.page)
        else:
            uusi(s)
        assert s.page.locator("[data-ai-mode]").count() == 0
        assert nakyy(s.page, "#quickfuel-form")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_taytä_kasin_avaa_lomakkeen(browser, base):
    s, tila = avaa_plus(browser, base)
    try:
        uusi(s)
        s.page.click("[data-ai-manual]")
        pg = s.page
        assert nakyy(pg, "#quickfuel-form") and not nakyy(pg, "[data-ai-mode]")
        assert nakyy(pg, "[data-ai-scan]"), "lomakkeen Täytä kuvasta jää käyttöön"
        assert pg.evaluate("document.activeElement.name") == "ppu"
        assert tila["ai"] == []
    finally:
        s.sulje()


def test_teksti_esitayttaa_lomakkeen(browser, base):
    s, tila = avaa_plus(browser, base)
    try:
        pg = s.page
        talli = s.talli()
        uusi(s)
        kirjoita(s, tila, "  Tankkasin eilen 45,6 l dieseliä 84,77 € mittari 153 100  ", TEKSTI)
        lomakkeen_viesti(pg, "Tiedot luettu tekstistä. Tarkista ne.")
        assert nakyy(pg, "#quickfuel-form") and not nakyy(pg, "[data-ai-mode]")
        f = "#quickfuel-form"
        assert pg.input_value(f + " [name=qty]") == "45,60" and pg.input_value(f + " [name=cost]") == "84,77"
        assert pg.input_value(f + " [name=km]") == "153100" and pg.input_value(f + " [name=date]") == "2026-10-28"
        assert pg.evaluate("document.activeElement.name") == "km"
        # Teksti lähti JSONina yhdessä pyynnössä: siistitty teksti ja laitteen päivä (sanoja kuten "eilen" varten).
        assert tila["ai"] == ["ai.receipt"]
        assert tila["ai_pyynnot"][0]["tyyppi"] == "application/json"
        assert json.loads(tila["ai_pyynnot"][0]["runko"]) == {"text": "Tankkasin eilen 45,6 l dieseliä 84,77 € mittari 153 100", "today": TANAAN}
        assert s.talli() == talli, "mitään ei tallenneta ennen käyttäjää"
        pg.click(f + " [type=submit]")
        pg.wait_for_function("() => !document.querySelector('.sheet-layer')")
        uusi_ = [x for x in s.talli()["cars"][0]["fuels"] if x["km"] == 153100]
        assert len(uusi_) == 1 and uusi_[0]["qty"] == 45.6 and uusi_[0]["date"] == "2026-10-28", uusi_
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("tapaus,vastaus,status,teksti", [
    ("ei-tankkausta", TYHJA, 200, "Tekstistä ei löytynyt tankkauksen tietoja"),
    ("ristiriita", {**TEKSTI, "mismatch": True}, 200, "eivät täsmää keskenään"),
    ("kiintio", {}, 429, "Tämän kuun tunnistukset on käytetty"),
    ("palvelin", {}, 502, "Tekstiä ei voitu lukea nyt"),
])
def test_teksti_ei_onnistu_tila_jaa_auki(browser, base, tapaus, vastaus, status, teksti):
    s, tila = avaa_plus(browser, base)
    try:
        uusi(s)
        kirjoita(s, tila, "jotain", vastaus, status, enter=False)
        tilan_viesti(s.page, teksti)
        assert nakyy(s.page, "[data-ai-mode]") and not nakyy(s.page, "#quickfuel-form")
        for n in ("qty", "ppu", "cost"):
            assert s.page.input_value(f"#quickfuel-form [name={n}]") == "", (tapaus, n)
        assert not s.page.locator("[data-ai-send]").is_disabled() and not s.page.locator("#ai-say-in").is_disabled()
    finally:
        s.sulje()


def test_tyhja_teksti_ei_laheta(browser, base):
    s, tila = avaa_plus(browser, base)
    try:
        uusi(s)
        s.page.click("[data-ai-send]")
        tilan_viesti(s.page, "Kirjoita ensin tankkauksen tiedot")
        s.page.wait_for_timeout(200)
        assert tila["ai"] == []
    finally:
        s.sulje()


def test_pelkka_mittarilukema_tekstista(browser, base):
    s, tila = avaa_plus(browser, base)
    try:
        uusi(s)
        kirjoita(s, tila, "mittari 153100", {**TYHJA, "kind": "text", "odometer": 153100, "odometer_unit": "km"})
        lomakkeen_viesti(s.page, "Tiedot luettu tekstistä. Tarkista ne.")
        assert s.page.input_value("#quickfuel-form [name=km]") == "153100"
        assert "700" in s.page.inner_text(".sf-gap")
    finally:
        s.sulje()


def test_kuva_tekoalytilasta(browser, base, kuva):
    s, tila = avaa_plus(browser, base)
    try:
        uusi(s)
        tila["ai_vastaus"] = PUMPPU
        s.page.set_input_files("[data-ai-cam-file]", str(kuva))
        lomakkeen_viesti(s.page, "Tiedot luettu tankkausmittarista")
        assert nakyy(s.page, "#quickfuel-form") and not nakyy(s.page, "[data-ai-mode]")
        assert s.page.input_value("#quickfuel-form [name=qty]") == "45,60"
        assert tila["ai_pyynnot"][0]["tyyppi"] == "image/jpeg" and 0 < tila["ai_pyynnot"][0]["koko"] < kuva.stat().st_size
    finally:
        s.sulje()


def test_tunnistamaton_kuva_jattaa_tilan_auki(browser, base, kuva):
    s, tila = avaa_plus(browser, base)
    try:
        uusi(s)
        tila["ai_vastaus"] = TYHJA
        s.page.set_input_files("[data-ai-cam-file]", str(kuva))
        tilan_viesti(s.page, "Kuvasta ei löytynyt kuittia, tankkausmittaria eikä mittaristoa")
        assert nakyy(s.page, "[data-ai-mode]") and not nakyy(s.page, "#quickfuel-form")
    finally:
        s.sulje()


@pytest.mark.parametrize("kieli,kamera,kasin,paikka,valmis", [
    ("fi", "Ota tai valitse kuva", "Täytä käsin", "Esim. 45,6 l dieseliä", "Tarkista ne"),
    ("en", "Take or choose a photo", "Fill in by hand", "E.g. 45.6 l diesel", "Check them"),
    ("sv", "Ta eller välj en bild", "Fyll i för hand", "T.ex. 45,6 l diesel", "Kontrollera dem"),
])
def test_kolme_kielta_ja_kapea_naytto(browser, base, kieli, kamera, kasin, paikka, valmis):
    s = avaa(browser, base, "fuel/tst1", autot=tiedot.talli(), kello=KELLO, kieli=kieli, leveys=320, korkeus=640,
             extra={"ajoura-tekoaly": "1"})
    try:
        tila = palvelu(s)
        uusi(s)
        pg = s.page
        teksti = pg.inner_text("[data-ai-mode]")
        assert kamera in teksti and kasin in teksti, teksti
        assert pg.get_attribute("#ai-say-in", "placeholder").startswith(paikka)
        r = pg.evaluate("""() => { const sh = document.querySelector('.sheet').getBoundingClientRect();
            return [...document.querySelectorAll('[data-ai-cam], #ai-say-in, [data-ai-send]')].map(e => { const b = e.getBoundingClientRect();
              return { h: b.height, ok: b.left >= sh.left - 0.5 && b.right <= sh.right + 0.5 }; }); }""")
        assert all(x["ok"] and x["h"] >= 44 for x in r), r
        assert pg.evaluate("document.querySelector('.sheet').scrollWidth <= document.querySelector('.sheet').clientWidth")
        kirjoita(s, tila, "45,6 l 84,77 € mittari 153100", TEKSTI)
        lomakkeen_viesti(pg, valmis)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
