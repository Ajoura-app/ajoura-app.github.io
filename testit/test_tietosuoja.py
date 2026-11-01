"""9. Tietosuojaseloste (AJ-22, 0.65): ei viittaa Apu-välilehteen, jota ei ole; ohjeena Valikko → Anna palautetta
kolmella kielellä."""
import pytest

from apu import avaa

OHJE = {"fi": "Valikko → Anna palautetta", "en": "Menu → Give feedback", "sv": "Meny → Ge respons"}
KIELETTY = ["Apu-välilehde", "Apu-välilehti", "Help tab", "Hjälp-flik", "fliken Hjälp"]


@pytest.mark.parametrize("kieli", ["fi", "en", "sv"])
def test_tietosuoja_ohjaa_valikon_palautteeseen(browser, base, kieli):
    s = avaa(browser, base, None, polku="tietosuoja.html", kieli=kieli, odota=False)
    try:
        s.page.wait_for_load_state("load")
        s.page.wait_for_timeout(300)
        teksti = s.page.inner_text("body")
        assert teksti.count(OHJE[kieli]) == 2, f"{kieli}: odotettiin kaksi ohjetta '{OHJE[kieli]}'"
        for k in KIELETTY:
            assert k not in teksti, f"{kieli}: vanhentunut viittaus '{k}'"
        assert not s.virheet, "; ".join(s.virheet)
    finally:
        s.sulje()
