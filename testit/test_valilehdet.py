"""0.68: etusivun alavalikossa vain kuvakkeet; nimi säilyy ruudunlukijalle (aria-label), Tankkaus-kuvake on pumppu + salama."""
import pytest

import tiedot
from apu import KELLO, avaa

NIMET = {"fi": ["Koti", "Tankkaus ja lataus", "Raportit", "Valikko"],
         "en": ["Home", "Fuel and charging", "Reports", "Menu"],
         "sv": ["Hem", "Tankning och laddning", "Rapporter", "Meny"]}


@pytest.mark.parametrize("kieli", ["fi", "en", "sv"])
def test_valilehdissa_vain_kuvakkeet(browser, base, kieli):
    s = avaa(browser, base, "home", autot=[tiedot.auto()], kieli=kieli, kello=KELLO)
    try:
        r = s.page.evaluate("""() => [...document.querySelectorAll('.main-tabs a')].map(a => ({
          teksti: a.textContent.trim(), nimi: a.getAttribute('aria-label'), kuva: a.querySelectorAll('svg').length,
          korkeus: a.getBoundingClientRect().height, polut: a.querySelectorAll('svg path').length}))""")
        assert len(r) == 4 and all(x["teksti"] == "" and x["kuva"] == 1 and x["korkeus"] >= 40 for x in r), r
        assert [x["nimi"] for x in r] == NIMET[kieli], r
        assert r[1]["polut"] == 2, "Tankkaus-kuvakkeessa pitää olla pumppu ja salama"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_alavalikko_kelluva_kapseli(browser, base):
    """0.72: alavalikko on kapea kelluva kapseli (ei koko näytön levyinen), keskellä ja pyöristetty; valittu välilehti korostettu."""
    s = avaa(browser, base, "fuel/tst1", autot=[tiedot.auto()], leveys=390, kello=KELLO)
    try:
        r = s.page.evaluate("""() => {const n = document.querySelector('.main-tabs'), b = n.getBoundingClientRect(),
          g = document.querySelector('#app-screen').getBoundingClientRect(), cs = getComputedStyle(n),
          a = getComputedStyle(n.querySelector('a[aria-current]'));
          return {w: b.width, ruutu: g.width, vasen: b.left - g.left, oikea: g.right - b.right, py: parseFloat(cs.borderTopLeftRadius),
                  h: b.height, korostus: a.backgroundColor}}""")
        assert r["w"] < r["ruutu"] * 0.8 and abs(r["vasen"] - r["oikea"]) < 2 and r["py"] >= r["h"] / 2 - 1, r
        assert r["korostus"] != "rgba(0, 0, 0, 0)", r
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
