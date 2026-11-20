"""2.27 (GPS-suunnitelman vaihe 2b): oma sijainti kartalla vain pyydettäessä.

- Sijaintia ei kysytä ennen painallusta; painallus keskittää kartan ja näyttää merkin.
- Sijaintia ei lähetetä minnekään eikä tallenneta: keskitys ei muuta tallennettua kartan näkymää, ja merkki katoaa,
  kun Kartta suljetaan.
- Estetty lupa ja epäonnistunut haku antavat lyhyen ilmoituksen; tietosuojaseloste kertoo toiminnosta.
"""
import json

from apu import avaa
from test_v225 import odota_tila, tyyli
import tiedot

PAIKKA = {"latitude": 62.7903, "longitude": 22.8403}  # keksitty piste (Seinäjoen keskusta)
LASKURI = """() => { window.__sijainti = 0; const g = navigator.geolocation, f = g.getCurrentPosition.bind(g);
  g.getCurrentPosition = (...a) => { window.__sijainti++; return f(...a); }; }"""


def kartta(browser, base, lupa=True, **k):
    s = avaa(browser, base, "home", autot=tiedot.talli(), **k)
    if lupa:
        s.context.grant_permissions(["geolocation"], origin=base)
        s.context.set_geolocation(PAIKKA)
    pyynnot = []
    s.page.on("request", lambda r: pyynnot.append(r.url))
    tyyli(s)
    s.page.evaluate(LASKURI)
    s.page.locator('.main-tabs a[aria-label="Kartta"]').click()
    odota_tila(s, "ready")
    return s, pyynnot


def test_sijainti_vain_pyydettaessa(browser, base):
    s, pyynnot = kartta(browser, base)
    try:
        p = s.page
        nappi = p.locator("[data-kartta-sijainti]")
        assert nappi.get_attribute("aria-label") == "Näytä oma sijainti"
        b = nappi.bounding_box()
        assert b["width"] >= 44 and b["height"] >= 44
        p.wait_for_timeout(500)
        assert p.evaluate("window.__sijainti") == 0, "sijaintia kysyttiin ennen painallusta"
        ennen = p.evaluate("localStorage.getItem('ajoura-kartta-nakyma')")
        nappi.click()
        p.wait_for_selector(".kartta-oma")
        p.wait_for_function("() => !document.querySelector('[data-kartta-sijainti][aria-busy]')")
        p.wait_for_timeout(1200)
        assert p.evaluate("window.__sijainti") == 1
        keski = p.evaluate("() => { const r = document.querySelector('.kartta-map').getBoundingClientRect(), m = document.querySelector('.kartta-oma').getBoundingClientRect();"
                           " return [m.left + m.width / 2 - (r.left + r.width / 2), m.top + m.height / 2 - (r.top + r.height / 2)]; }")
        assert abs(keski[0]) < 3 and abs(keski[1]) < 3, keski
        # Sijaintia ei tallenneta: kartan muistama näkymä ei muutu keskityksestä.
        assert p.evaluate("localStorage.getItem('ajoura-kartta-nakyma')") == ennen
        assert "62.79" not in json.dumps(p.evaluate("({...localStorage})"))
        assert not [u for u in pyynnot if "62.79" in u or "22.84" in u], "sijainti lähti verkkoon"
        # Käyttäjän oma zoomaus tallennetaan kuten ennen.
        p.locator('[data-kartta-zoom="out"]').click(); p.wait_for_timeout(800)
        assert p.evaluate("localStorage.getItem('ajoura-kartta-nakyma')") != ennen
        # Merkki katoaa, kun Kartta suljetaan.
        p.locator('.main-tabs a[aria-label="Koti"]').click(); p.wait_for_selector(".secretary-home")
        p.locator('.main-tabs a[aria-label="Kartta"]').click(); odota_tila(s, "ready")
        assert p.locator(".kartta-oma").count() == 0
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_sijaintilupa_estetty(browser, base):
    s, _ = kartta(browser, base, lupa=False)
    try:
        s.page.locator("[data-kartta-sijainti]").click()
        ilmoitus = s.page.locator(".kartta-ilmoitus")
        ilmoitus.wait_for(state="visible", timeout=8000)
        assert ilmoitus.inner_text().startswith("Sijaintilupa on estetty.")
        assert s.page.locator(".kartta-oma").count() == 0
        assert s.page.locator("[data-kartta-sijainti][aria-busy]").count() == 0
    finally:
        s.sulje()


def test_sijaintia_ei_saatu(browser, base):
    s, _ = kartta(browser, base)
    try:
        s.page.evaluate("navigator.geolocation.getCurrentPosition = (ok, virhe) => setTimeout(() => virhe({code: 3}), 50)")
        s.page.locator("[data-kartta-sijainti]").click()
        ilmoitus = s.page.locator(".kartta-ilmoitus")
        ilmoitus.wait_for(state="visible", timeout=8000)
        assert ilmoitus.inner_text() == "Sijaintia ei saatu. Yritä uudelleen."
    finally:
        s.sulje()


def test_tumma_tila_ja_kapea(browser, base):
    s, _ = kartta(browser, base, teema="dark", leveys=320)
    try:
        p = s.page
        p.locator("[data-kartta-sijainti]").click()
        p.wait_for_selector(".kartta-oma")
        # Merkki on kartan sisällä, joka käännetään takaisin: värit todelliset (sininen, valkoinen reuna).
        assert p.evaluate("getComputedStyle(document.querySelector('.kartta-oma')).backgroundColor") == "rgb(23, 105, 244)"
        assert p.evaluate("document.querySelector('.kartta-oma').closest('.kartta-map') !== null")
        assert p.evaluate("document.querySelector('#app-screen').scrollWidth <= document.querySelector('#app-screen').clientWidth")
    finally:
        s.sulje()


def test_seloste_kertoo_omasta_sijainnista(browser, base):
    s = avaa(browser, base, None, polku="tietosuoja.html", odota=False)
    try:
        s.page.wait_for_load_state("load")
        teksti = " ".join(s.page.inner_text("main").split())
        assert "Oma sijainti: kun painat kartan sijaintipainiketta, selain kysyy luvan" in teksti
        assert "Sitä ei lähetetä AJOURAlle eikä tallenneta" in teksti
        assert "karttapalvelu saa karttakuvien pyynnöistä tiedon katsotusta alueesta" in teksti
    finally:
        s.sulje()
