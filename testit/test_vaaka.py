"""9. Vaakasuunta (0.48 asennettu sovellus, 0.49 Safari): matalassa vaakanäkymässä tekstit pysyvät
pystynäkymän kokoisina, mitään ei leikkaudu ja Tallenna-nappi on tavoitettavissa."""
import pytest

import tiedot
from apu import KELLO, avaa

KOOT = [(844, 390), (667, 375)]
NAKYMAT = ["home", "fuel/tst1", "reports", "add/tst1", "menu", "vehicle/tst1"]
# Käyttötilat: asennettu Koti-valikon sovellus (0.48)
TILAT = {
    "asennettu": dict(asennettu=True, ios=True),
}

MITTAUS = """() => {
  const sc = document.querySelector('#app-screen .screen-content');
  const el = document.querySelector('.tab-bar');  // lomakenäkymissä (esim. add) alavalikkoa ei ole
  const tb = el ? el.getBoundingClientRect() : null;
  return {
    yli: sc.scrollWidth - sc.clientWidth,
    zoom: parseFloat(getComputedStyle(sc).zoom),
    tabZoom: el ? parseFloat(getComputedStyle(el).zoom) : null,
    tabAla: tb ? tb.bottom : null, tabYla: tb ? tb.top : null, ikkuna: innerHeight,
    luokka: document.documentElement.className,
  };
}"""


@pytest.mark.parametrize("tila", TILAT)
@pytest.mark.parametrize("kieli", ["fi", "en", "sv"])
@pytest.mark.parametrize("koko", KOOT, ids=lambda k: f"{k[0]}x{k[1]}")
def test_vaakanakymat(browser, base, tila, kieli, koko):
    s = avaa(browser, base, "home", autot=tiedot.talli(), kieli=kieli, leveys=koko[0], korkeus=koko[1],
             kello=KELLO, **TILAT[tila])
    virheet = []
    try:
        for v in NAKYMAT:
            s.page.goto(base + "/app.html#" + v)
            s.page.wait_for_timeout(250)
            m = s.page.evaluate(MITTAUS)
            if m["yli"] > 0:
                virheet.append(f"#{v}: {m['yli']} px sivuttain yli")
            if abs(m["zoom"] - 1.12) > 0.001 or (m["tabZoom"] is not None and abs(m["tabZoom"] - 1.12) > 0.001):
                virheet.append(f"#{v}: suurennus {m['zoom']}/{m['tabZoom']}, pitäisi olla 1,12")
            if m["tabAla"] is not None and (m["tabAla"] > m["ikkuna"] + 0.5 or m["tabYla"] < 0):
                virheet.append(f"#{v}: alavalikko ruudun ulkopuolella ({m['tabYla']:.0f}–{m['tabAla']:.0f} / {m['ikkuna']})")
        assert not virheet, f"{tila} {koko} {kieli}: " + "; ".join(virheet)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("tila", TILAT)
@pytest.mark.parametrize("koko", KOOT, ids=lambda k: f"{k[0]}x{k[1]}")
def test_tankkausikkunan_tallenna_on_tavoitettavissa(browser, base, tila, koko):
    s = avaa(browser, base, "home", autot=tiedot.talli(), leveys=koko[0], korkeus=koko[1], kello=KELLO,
             **TILAT[tila])
    try:
        s.page.click("[data-quickfuel]")
        s.page.wait_for_selector("#quickfuel-form")
        s.page.wait_for_timeout(500)
        # Ikkuna vierittyy; vieritetään loppuun ja katsotaan, että painike on silloin kokonaan ruudulla.
        s.page.evaluate("document.querySelector('.sheet').scrollTop = 1e6")
        s.page.wait_for_timeout(200)
        r = s.page.evaluate("""() => {
          const b = document.querySelector('#quickfuel-form [type=submit]').getBoundingClientRect();
          return {yla: b.top, ala: b.bottom, ikkuna: innerHeight};
        }""")
        assert r["yla"] >= 0 and r["ala"] <= r["ikkuna"] + 0.5, r
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_pystynakyma_ja_leva_pysty_eivat_muutu(browser, base):
    """Suurennus vaihtuu vain matalassa vaakanäkymässä: puhelin pystyssä 1,12 ja leveä tabletti pystyssä 1,3."""
    for (l, k, odotettu) in [(390, 844, 1.12), (700, 1000, 1.3)]:
        s = avaa(browser, base, "home", autot=tiedot.talli(), leveys=l, korkeus=k, kello=KELLO,
                 asennettu=True, ios=True)
        try:
            m = s.page.evaluate(MITTAUS)
            assert abs(m["zoom"] - odotettu) < 0.001, (l, k, m["zoom"])
        finally:
            s.sulje()
