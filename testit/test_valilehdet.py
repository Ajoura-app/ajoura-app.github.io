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


@pytest.mark.parametrize("leveys", [320, 360, 390, 430])
def test_alavalikko_kelluva_kapseli(browser, base, leveys):
    """0.72: alavalikko on kelluva kapseli (pyöristetty, keskellä, valittu korostettu). 0.73: sen leveys on sama kuin
    ajoneuvoikkunan sisällön (Koti-näkymän tilarivi ja napit) ja kuvakkeet ovat tasavälein."""
    s = avaa(browser, base, "home", autot=[tiedot.auto()], leveys=leveys, kello=KELLO)
    try:
        r = s.page.evaluate("""() => {const n = document.querySelector('.main-tabs'), b = n.getBoundingClientRect(),
          g = document.querySelector('#app-screen').getBoundingClientRect(), k = document.querySelector('.row-actions').getBoundingClientRect(),
          cs = getComputedStyle(n), alav = g.bottom - b.bottom, a = getComputedStyle(n.querySelector('a[aria-current]')),
          xs = [...n.querySelectorAll('a svg')].map(v => {const q = v.getBoundingClientRect(); return q.left + q.width / 2});
          return {vasen: b.left - k.left, oikea: b.right - k.right, keski: (b.left + b.right) / 2 - (g.left + g.right) / 2,
                  py: parseFloat(cs.borderTopLeftRadius), alaväli: alav, h: b.height, korostus: a.backgroundColor,
                  valit: xs.slice(1).map((x, i) => x - xs[i])}}""")
        assert abs(r["vasen"]) <= 2 and abs(r["oikea"]) <= 2 and abs(r["keski"]) <= 1, r
        assert r["py"] >= r["h"] / 2 - 1 and r["korostus"] != "rgba(0, 0, 0, 0)", r
        assert r["alaväli"] <= 10, r  # 0.74: kapseli lähellä alareunaa (iPhonessa kotipalkin yläpuolella)
        assert r["korostus"] != "rgb(228, 237, 251)" and r["korostus"].startswith("rgb("), r  # 0.74: valittu täyteen siniseksi (ei vaalea tausta)
        assert max(r["valit"]) - min(r["valit"]) <= 1.5, r  # kuvakkeet tasavälein
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
