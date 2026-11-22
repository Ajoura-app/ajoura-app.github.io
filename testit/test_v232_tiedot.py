"""2.32 (GPS-suunnitelman vaihe 2f): ajon tiedot (vain luku).

#ajot/<laite>-<alku>-<loppu>: ajo haetaan palvelimelta uudelleen, joten linkki toimii myös uudelleenlatauksen jälkeen.
Kartta reitteineen, päivämäärä, lähtö ja saapuminen, matka, kesto, nopeudet, ajotyyppi Luokittelematon, tietolähde.
Ei tallentavia toimintoja (vaihe 3). Keksitty GPS-palvelu, kello lukittu.
"""
import calendar
import time

from apu import avaa
from test_plus import FREE_AI, palvelu
from test_v225 import tyyli
import gps_keksitty as G
import tiedot


def ajo_id(t):
    return f"7-{calendar.timegm(time.strptime(t['start'], '%Y-%m-%dT%H:%M:%SZ'))}-{calendar.timegm(time.strptime(t['end'], '%Y-%m-%dT%H:%M:%SZ'))}"


def avaa_ajo(browser, base, ajo, tila=None, **k):
    s = avaa(browser, base, "home", autot=tiedot.talli(), kello=G.KELLO, **k)
    tila = G.palvelin(s.context, tila)
    palvelu(s, oikeus=FREE_AI)
    s.page.wait_for_selector('.main-tabs a[aria-label="Ajopäiväkirja"]', timeout=8000)
    tyyli(s)
    s.page.goto(f"{base}/app.html#ajot/{ajo}")
    s.page.reload()
    return s, tila


def rivit(p):
    return p.evaluate("[...document.querySelectorAll('.gps-tiedot div')].map(d => d.querySelector('dt').textContent + ': ' + d.querySelector('dd').textContent)")


def test_ajon_tiedot(browser, base):
    t = G.ajot()[0]
    s, tila = avaa_ajo(browser, base, ajo_id(t))
    try:
        p = s.page
        p.wait_for_selector(".gps-tiedot", timeout=10000)
        assert p.locator(".gps-tiedot-otsikko").inner_text() == "Testikunta B → Testikunta A"
        assert rivit(p) == ["Päivämäärä: 18.11.2026", "Lähtö: 14.00 Testikunta B", "Lähtöosoite: Testikatu 2, 65100 Testikunta B, Finland",
                            "Saapuminen: 15.06 Testikunta A", "Matka: 78 km", "Kesto: 1 h 06 min", "Keskinopeus: 71 km/h", "Suurin nopeus: 98 km/h",
                            "Ajotyyppi: Luokittelematon", "Tietolähde: Traccar GPS"]
        assert "GPS-matka ei ole matkamittarin lukema" in p.locator(".gps-ajon-tiedot").inner_text()
        p.wait_for_selector(".gps-tiedot-kartta canvas", timeout=10000)
        assert any(q["action"] == "route" and q["from"] == "2026-11-18T11:59:00Z" for q in tila["pyynnot"])
        teksti = p.locator(".screen-content").inner_text()
        assert "Merkitse työajoksi" not in teksti and "Vie raportteihin" not in teksti and "muistiinpano" not in teksti.lower().replace("muistiinpano ja vienti raportteihin tulevat myöhemmin", "")
        assert p.locator('.main-tabs a[aria-label="Ajopäiväkirja"]').get_attribute("aria-current") == "page"
        p.locator(".gps-takaisin").click()
        p.wait_for_selector(".gps-ajo")
        assert p.locator(".gps-tiedot-kartta").count() == 0
        assert not [v for v in s.virheet if "ERR_FAILED" not in v], s.virheet
    finally:
        s.sulje()


def test_tuntematon_ja_rikkinainen(browser, base):
    s, _ = avaa_ajo(browser, base, "7-1795500000-1795503000")
    try:
        s.page.wait_for_selector(".gps-virhe")
        assert s.page.locator(".gps-virhe").inner_text().startswith("Ajoa ei löytynyt.")
        s.page.goto(f"{base}/app.html#ajot/<script>")
        s.page.wait_for_selector(".gps-virhe")
        assert s.page.locator(".gps-virhe").inner_text() == "Ajoa ei löytynyt."
        s.page.goto(f"{base}/app.html#ajot/99-1795500000-1795503000")  # vieras laite
        s.page.wait_for_function("document.querySelector('.gps-virhe')?.textContent === 'Ajoa ei löytynyt.'")
    finally:
        s.sulje()


def test_tumma_ja_haitallinen_osoite(browser, base):
    t = G.ajot()[0]
    s = avaa(browser, base, "home", autot=tiedot.talli(), kello=G.KELLO, teema="dark", leveys=320, korkeus=568)
    alkup = G.ajot

    def ajot_xss(nyt=None):
        a = alkup(nyt); a[0]["startAddress"] = "<img src=x onerror=window.__xss=1>, Kaupunki"; return a
    G.ajot = ajot_xss
    try:
        G.palvelin(s.context, {"kunnat": {"meta": {"versio": 1}, "kunnat": []}})
        palvelu(s, oikeus=FREE_AI)
        s.page.wait_for_selector('.main-tabs a[aria-label="Ajopäiväkirja"]', timeout=8000)
        tyyli(s)
        s.page.goto(f"{base}/app.html#ajot/{ajo_id(t)}"); s.page.reload()
        p = s.page
        p.wait_for_selector(".gps-tiedot", timeout=10000)
        assert p.evaluate("window.__xss") is None and p.locator(".gps-ajon-tiedot img").count() == 0
        assert "<img src=x onerror=window.__xss=1>, Kaupunki" in p.locator(".gps-tiedot").inner_text()
        p.wait_for_selector(".gps-tiedot-kartta canvas", timeout=10000)
        assert "invert(1)" in p.evaluate("getComputedStyle(document.querySelector('.gps-tiedot-kartta')).filter")
        assert p.evaluate("document.documentElement.scrollWidth <= innerWidth")
    finally:
        G.ajot = alkup
        s.sulje()
