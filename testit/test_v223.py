"""2.23 (Niklas): ajoneuvokohtainen öljynvaihtoväli. Oletus 15 000 km / 12 kk (Asetusten väli); ajoneuvolle voi valita
oman välin (⋯ → Öljynvaihtoväli). Tallentuu ajoneuvon kenttään oil = {km, months}; ilman sitä käytetään oletusta.
Vanhan version varmuuskopio palautuu ennallaan, viallinen väli ei kaada tallia."""
import json

import pytest

import tiedot
from apu import KELLO, avaa
from test_varmuuskopio import VANHA, palauta, tallenna_ladaten

# tst1: viimeisin huolto 14.3.2025 / 128 900 km. tst2: huolto 4.4.2026 / 45 100 km, mittari 48 200 km.
HUOLTO = "() => document.querySelector('.upcoming li').innerText.replace(/\\u00a0/g, ' ')"
PILLERI = "id => document.querySelector(`.vehicle-home-card[data-car=\"${id}\"] .home-service-pill`)?.innerText.trim()"


def autot(**oil):
    t = tiedot.talli()
    for c in t:
        if c["id"] in oil:
            c["oil"] = oil[c["id"]]
    return t


def oil_of(s, cid):
    return next(c for c in s.talli()["cars"] if c["id"] == cid).get("oil")


def test_oletus_15000_km_12_kk(browser, base):
    s = avaa(browser, base, "vehicle/tst1", autot=tiedot.talli(), kello=KELLO)
    try:
        p = s.page
        assert "Arvio: 14.3.2026 tai 143 900 km" in p.evaluate(HUOLTO)
        p.click('.veh-menu>summary')
        assert p.inner_text('.veh-mi[href="#oil/tst1"]').replace('\xa0', ' ').endswith('15 000 km tai 12 kk · oletus')
        p.click('.veh-mi[href="#oil/tst1"]'); p.wait_for_selector('#oil-form')
        assert p.is_checked('[name=mode][value=default]') and p.locator('.oil-fields').is_hidden()
        assert '15 000 km tai 12 kk' in p.inner_text('.oil-mode').replace('\xa0', ' ')
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_oma_vali_tallentuu_ja_vaikuttaa_vain_tahan_ajoneuvoon(browser, base):
    s = avaa(browser, base, "oil/tst1", autot=tiedot.talli(), kello=KELLO)
    try:
        p = s.page
        p.check('[name=mode][value=own]')
        assert p.locator('.oil-fields').is_visible()
        p.fill('#oil-form [name=km]', '30000'); p.fill('#oil-form [name=months]', '24')
        p.click('#oil-form [type=submit]'); p.wait_for_function('location.hash==="#vehicle/tst1"'); p.wait_for_selector('.upcoming')
        assert oil_of(s, "tst1") == {"km": 30000, "months": 24} and oil_of(s, "tst2") is None
        assert "Öljynvaihtoväli tallennettu" in p.inner_text('.success-note')
        assert "Arvio: 14.3.2027 tai 158 900 km" in p.evaluate(HUOLTO)
        p.click('.veh-menu>summary')
        assert p.inner_text('.veh-mi[href="#oil/tst1"]').replace('\xa0', ' ').endswith('30 000 km tai 24 kk · oma väli')
        # Toinen ajoneuvo käyttää yhä oletusta.
        p.evaluate('location.hash="#vehicle/tst2"'); p.wait_for_selector('.upcoming')
        assert "Arvio: 4.4.2027 tai 60 100 km" in p.evaluate(HUOLTO)
        # Takaisin oletukseen: kenttä poistuu.
        p.evaluate('location.hash="#oil/tst1"'); p.wait_for_selector('#oil-form')
        assert p.input_value('#oil-form [name=km]') == '30000'
        p.check('[name=mode][value=default]'); p.click('#oil-form [type=submit]')
        p.wait_for_function('location.hash==="#vehicle/tst1"')
        assert oil_of(s, "tst1") is None
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("km,kk,virhe", [("500", "12", "Kilometrejä voi olla 1 000–60 000."),
                                         ("15000", "48", "Kuukausia voi olla 1–36."),
                                         ("", "12", "Kilometrejä voi olla 1 000–60 000.")])
def test_virheelliset_arvot(browser, base, km, kk, virhe):
    s = avaa(browser, base, "oil/tst1", autot=tiedot.talli(), kello=KELLO)
    try:
        p = s.page
        p.check('[name=mode][value=own]')
        p.fill('#oil-form [name=km]', km); p.fill('#oil-form [name=months]', kk)
        p.click('#oil-form [type=submit]')
        assert p.inner_text('#form-error').replace('\xa0', ' ') == virhe
        assert p.evaluate('location.hash') == '#oil/tst1' and oil_of(s, "tst1") is None
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_etusivun_huoltomittari_kayttaa_ajoneuvon_valia(browser, base):
    # tst2: oletuksella aika ratkaisee (157 pv / 365 = 43 %); 5 000 km:n välillä kilometrit (1 900 / 5 000 = 38 %).
    s = avaa(browser, base, "home", autot=tiedot.talli(), kello=KELLO)
    try:
        assert s.page.evaluate(PILLERI, "tst2") == "43 %"
    finally:
        s.sulje()
    s = avaa(browser, base, "home", autot=autot(tst2={"km": 5000, "months": 12}), kello=KELLO)
    try:
        assert s.page.evaluate(PILLERI, "tst2") == "38 %"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tuntimittarilla_vain_kuukaudet(browser, base):
    s = avaa(browser, base, "oil/tst3", autot=tiedot.talli(), kello=KELLO)
    try:
        p = s.page
        p.check('[name=mode][value=own]')
        assert p.locator('#oil-form [name=km]').count() == 0
        p.fill('#oil-form [name=months]', '6'); p.click('#oil-form [type=submit]')
        p.wait_for_function('location.hash==="#vehicle/tst3"'); p.wait_for_selector('.upcoming')
        assert oil_of(s, "tst3") == {"km": 15000, "months": 6}
        assert "Arvio: 10.11.2026" in p.evaluate(HUOLTO)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_viallinen_vali_ei_kaada_tallia(browser, base):
    s = avaa(browser, base, "vehicle/tst1", autot=autot(tst1={"km": 5, "months": "x"}), kello=KELLO)
    try:
        p = s.page
        assert p.evaluate('location.hash') == '#vehicle/tst1'
        assert "Arvio: 14.3.2026 tai 143 900 km" in p.evaluate(HUOLTO)
        assert [c["id"] for c in s.talli()["cars"]] == ["tst1", "tst2", "tst3"]
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_varmuuskopio_sailyttaa_valin_ja_vanha_palautuu(browser, base, tmp_path):
    alku = autot(tst1={"km": 30000, "months": 24})
    s = avaa(browser, base, "me", autot=alku, mobiili=False, leveys=1280, korkeus=900, kello=KELLO)
    try:
        polku = tallenna_ladaten(s, tmp_path)
        data = json.loads(polku.read_text("utf-8"))
        assert next(c for c in data["cars"] if c["id"] == "tst1")["oil"] == {"km": 30000, "months": 24}
    finally:
        s.sulje()
    # Uuden version tiedosto tyhjään talliin: väli säilyy.
    s = avaa(browser, base, "me", autot=None, mobiili=False, leveys=1280, korkeus=900, kello=KELLO)
    try:
        assert "palautettu" in palauta(s, polku)
        assert oil_of(s, "tst1") == {"km": 30000, "months": 24}
    finally:
        s.sulje()
    # Vanhan version (0.37) varmuuskopio: ei väliä, ajoneuvot käyttävät oletusta.
    s = avaa(browser, base, "me", autot=None, mobiili=False, leveys=1280, korkeus=900, kello=KELLO)
    try:
        assert "palautettu" in palauta(s, VANHA)
        assert all("oil" not in c for c in s.talli()["cars"])
        s.page.evaluate('location.hash="#vehicle/tst1"'); s.page.wait_for_selector('.upcoming')
        assert "12 kk · oletus" in s.page.evaluate("document.querySelector('.veh-mi[href=\"#oil/tst1\"]').textContent")
        # Viallinen väli varmuuskopiossa hylätään kuten muutkin virheelliset tiedot.
        huono = tmp_path / "huono.json"
        huono.write_text(json.dumps({"app": "AJOURA", "version": 1, "cars": autot(tst1={"km": 1, "months": 1}),
                                     "profile": {"name": "", "months": 12, "km": 15000}}), "utf-8")
        assert "voitu lukea" in palauta(s, huono)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
