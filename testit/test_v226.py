"""2.26: tietosuojaselosteeseen Kartta-kohta (Niklas hyväksyi tekstin 18.11.2026).

Kartta-välilehti (2.25) hakee karttakuvat OpenFreeMapista, joten seloste nimeää palvelun ja kertoo, mitä se näkee.
Vartija vaiheelle 2b: kun kartta.js:ään lisätään Esri-avain, selosteen pitää mainita Esri ennen julkaisua.
"""
import re
from pathlib import Path

from apu import avaa

JUURI = Path(__file__).resolve().parent.parent
KOHTA = ("Kun avaat Kartta-välilehden, sovellus hakee karttakuvat OpenFreeMap-palvelusta. Palvelu näkee laitteesi "
         "IP-osoitteen ja kartalla katsomasi alueen, kuten mikä tahansa verkkokartta. AJOURA ei lähetä palveluun tallisi "
         "tietoja eikä sijaintiasi. Kartta-aineisto © OpenStreetMap-tekijät (ODbL) ja © OpenMapTiles.")


def test_seloste_kertoo_kartasta(browser, base):
    s = avaa(browser, base, None, polku="tietosuoja.html", odota=False)
    try:
        s.page.wait_for_load_state("load")
        teksti = s.page.inner_text("main")
        assert KOHTA in " ".join(teksti.split())
        palvelut = s.page.locator("h2:has-text('Palvelut, joiden kautta sivu toimii') + ul").inner_text()
        assert "OpenFreeMap" in palvelut
        lahtee = s.page.locator("h2:has-text('Milloin tietoja lähtee laitteeltasi') ~ ul").first.inner_text()
        assert "Kartta" in lahtee and "OpenFreeMap" in lahtee
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_kartan_palvelut_selosteessa():
    js = (JUURI / "kartta.js").read_text(encoding="utf-8")
    seloste = (JUURI / "tietosuoja.html").read_text(encoding="utf-8")
    hostit = set(re.findall(r"https://([a-z0-9.-]+)/", js))
    assert "tiles.openfreemap.org" in hostit and "OpenFreeMap" in seloste
    avain = re.search(r"const ESRI_KEY = '([^']*)';", js).group(1)
    if avain:  # vaihe 2b: satelliittitaso käytössä
        assert "Esri" in seloste, "Esri-satelliitti on käytössä, mutta tietosuojaseloste ei mainitse Esriä"
