"""2.28 (GPS-suunnitelman vaihe 2b): Esri-satelliitti kartan tasovalikossa.

- Satelliittikuva Esrin World Imagery -palvelusta (osoite, tiilikoko ja lähdemerkintä Esrin arcgis/imagery-tyylistä).
- Lähdemerkinnässä Powered by Esri ja kuvantoimittajat, vain kun satelliitti on valittuna.
- Tietosuojaseloste kertoo Esristä (Niklaksen hyväksymä teksti).
Varautuminen (kuvat eivät lataudu → peruskartta) ja oletus pois: test_v225.py.
"""
import io
import re
from pathlib import Path

from PIL import Image

from apu import avaa
from test_v225 import satelliitti, valitse_taso, odota_tila
import tiedot

JUURI = Path(__file__).resolve().parent.parent
JS = (JUURI / "kartta.js").read_text(encoding="utf-8")
KOHTA = ("Satelliittikuva (valinnainen): kun valitset kartan tasovalikosta Satelliitti, kuvat haetaan Esrin palvelusta "
         "(Esri Inc., Yhdysvallat). Esri näkee laitteesi IP-osoitteen ja kartalla katsomasi alueen. Satelliitti on oletuksena "
         "pois päältä, joten Esrille ei lähetetä mitään ennen kuin valitset sen. Jos kuvat eivät lataudu, kartta palaa "
         "peruskarttaan. Kuvat © Esri ja kuvantoimittajat.")


def jpeg():
    b = io.BytesIO(); Image.new("RGB", (256, 256), (60, 90, 50)).save(b, format="JPEG")
    return b.getvalue()


def test_avain_ja_kuvapalvelu():
    avain = re.search(r"const ESRI_KEY = '([^']*)';", JS).group(1)
    assert avain.startswith("AAPT") and len(avain) > 100, "Esri-avain puuttuu tai on vajaa"
    assert "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=" in JS
    assert "tileSize: 256" in JS
    assert "Powered by" in JS and "Earthstar Geographics" in JS


def test_lahdemerkinta_vain_satelliitilla(browser, base):
    s = avaa(browser, base, "home", autot=tiedot.talli())
    kuva = jpeg()
    try:
        satelliitti(s, base, lambda route: route.fulfill(status=200, content_type="image/jpeg", body=kuva))
        lahde = lambda: s.page.evaluate("document.querySelector('.maplibregl-ctrl-attrib-inner')?.textContent || ''")
        assert "Esri" not in lahde()
        valitse_taso(s, "Satelliitti")
        s.page.wait_for_function("() => (document.querySelector('.maplibregl-ctrl-attrib-inner')?.textContent || '').includes('Powered by Esri')", timeout=8000)
        assert "Earthstar Geographics" in lahde()  # OpenStreetMap-merkintä tulee oikeasta peruskarttatyylistä (kuvakaappaus)
        assert s.page.locator(".kartta-ilmoitus").count() == 0
        valitse_taso(s, "Peruskartta")
        s.page.wait_for_function("() => !(document.querySelector('.maplibregl-ctrl-attrib-inner')?.textContent || '').includes('Esri')", timeout=8000)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tasovalikko_nappaimistolla(browser, base):
    s = avaa(browser, base, "home", autot=tiedot.talli())
    try:
        satelliitti(s, base, lambda route: route.abort())
        nappi = s.page.locator("[data-kartta-tasot]")
        nappi.click()
        assert nappi.get_attribute("aria-expanded") == "true"
        valikko = s.page.locator("#kartta-tasovalikko")
        assert valikko.is_visible() and valikko.locator("[role=menuitemradio]").count() == 2
        s.page.keyboard.press("Escape")
        assert valikko.is_hidden() and nappi.get_attribute("aria-expanded") == "false"
        assert s.page.evaluate("document.activeElement.matches('[data-kartta-tasot]')")
        # Valikko ei jää sijaintipainikkeen alle.
        nappi.click()
        osuu = s.page.evaluate("() => {const b = document.querySelector('[data-kartta-taso=satelliitti]').getBoundingClientRect();"
                               " return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.dataset.karttaTaso}")
        assert osuu == "satelliitti"
    finally:
        s.sulje()


def test_seloste_kertoo_esrista(browser, base):
    s = avaa(browser, base, None, polku="tietosuoja.html", odota=False)
    try:
        s.page.wait_for_load_state("load")
        teksti = " ".join(s.page.inner_text("main").split())
        assert KOHTA in teksti
        palvelut = s.page.locator("h2:has-text('Palvelut, joiden kautta sivu toimii') + ul").inner_text()
        assert "Esri (Esri Inc., Yhdysvallat): satelliittikuvat Kartta-välilehdellä, vain kun valitset satelliittitason." in " ".join(palvelut.split())
    finally:
        s.sulje()
