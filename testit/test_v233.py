"""2.33 (Niklas): huomautus epäilyttävän pitkästä ajosta.

Oikea havainto 22.11.2026: 13 km:n ajo näkyi kestävän 2 h 20 min (keskinopeus 6 km/h), koska GPS-palvelu ei
tunnistanut pysähdystä. Ajo, jonka keskinopeus on alle 10 km/h ja kesto vähintään 30 min, saa huomautuksen
ajon tiedoissa, Ajopäiväkirjan listassa ja kartan reittipaneelissa. Tietoja ei muuteta.
"""
import calendar
import time

from apu import avaa
from test_plus import FREE_AI, palvelu
from test_v225 import odota_tila, tyyli
import gps_keksitty as G
import tiedot

HUOMIO = "Loppuaika voi sisältää seisonta-aikaa"


def hidas_ajo(alkup):
    def ajot(nyt=None):
        a = alkup(nyt)
        a[0] = {**a[0], "durationS": 8400, "distanceM": 13000, "avgSpeedKmh": 6, "maxSpeedKmh": 76,
                "end": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(calendar.timegm(time.strptime(a[0]["start"], "%Y-%m-%dT%H:%M:%SZ")) + 8400))}
        return a
    return ajot


def avaa_gps(browser, base, **k):
    s = avaa(browser, base, "home", autot=tiedot.talli(), kello=G.KELLO, **k)
    G.palvelin(s.context)
    palvelu(s, oikeus=FREE_AI)
    s.page.wait_for_selector('.main-tabs a[aria-label="Ajopäiväkirja"]', timeout=8000)
    return s


def test_raja_arvot(browser, base):
    s = avaa(browser, base, "home", autot=[], kello=G.KELLO)
    try:
        f = lambda t: s.page.evaluate("t => AjouraGps._testi.epailyttava(t)", t)
        assert f({"avgSpeedKmh": 6, "durationS": 8400}) is True
        assert f({"avgSpeedKmh": 9, "durationS": 1800}) is True
        assert f({"avgSpeedKmh": 10, "durationS": 8400}) is False   # 10 km/h tai yli: tavallinen hidas ajo
        assert f({"avgSpeedKmh": 6, "durationS": 1799}) is False    # lyhyt ajo
        assert f({"avgSpeedKmh": None, "durationS": 8400}) is False  # ei mitattua keskinopeutta
    finally:
        s.sulje()


def test_huomautus_nakymissa(browser, base):
    alkup = G.ajot
    G.ajot = hidas_ajo(alkup)
    s = avaa_gps(browser, base)
    try:
        p = s.page
        tyyli(s)
        # Ajopäiväkirja: vain hidas ajo merkitty.
        p.locator('.main-tabs a[aria-label="Ajopäiväkirja"]').click()
        p.wait_for_selector(".gps-ajo")
        merkit = p.evaluate("[...document.querySelectorAll('.gps-ajo')].map(a => !!a.querySelector('.gps-epaily'))")
        assert merkit == [True, False, False]
        assert p.locator(".gps-epaily").inner_text() == HUOMIO
        # Ajon tiedot: huomautus, tiedot ennallaan (kesto ja keskinopeus kuten GPS-palvelu ilmoitti).
        p.locator(".gps-ajo").first.click()
        p.wait_for_selector(".gps-tiedot")
        assert HUOMIO in p.locator(".gps-ajon-tiedot .gps-huomio").inner_text()
        teksti = p.locator(".gps-tiedot").inner_text()
        assert "2 h 20 min" in teksti and "6 km/h" in teksti and "13 km" in teksti
        # Tavallinen ajo: ei huomautusta.
        p.locator(".gps-takaisin").click(); p.wait_for_selector(".gps-ajo")
        p.locator(".gps-ajo").nth(1).click(); p.wait_for_selector(".gps-tiedot")
        assert p.locator(".gps-huomio").count() == 0
        # Kartan reittipaneeli (viimeisin ajo = hidas ajo).
        p.locator('.main-tabs a[aria-label="Kartta"]').click(); odota_tila(s, "ready")
        p.wait_for_selector("[data-gps-reitti]"); p.locator("[data-gps-reitti]").click()
        p.wait_for_selector(".kartta-gps .gps-huomio")
        assert p.locator(".kartta-gps .gps-huomio").get_attribute("role") == "note"
        assert not [v for v in s.virheet if "ERR_FAILED" not in v], s.virheet
    finally:
        G.ajot = alkup
        s.sulje()
