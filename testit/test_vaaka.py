"""9. Vaakasuunta (0.48 asennettu sovellus, 0.49 Safari): matalassa vaakanäkymässä tekstit pysyvät
pystynäkymän kokoisina, mitään ei leikkaudu ja Tallenna-nappi on tavoitettavissa."""
import pytest

import tiedot
from apu import KELLO, avaa

KOOT = [(844, 390), (667, 375)]
NAKYMAT = ["home", "fuel/tst1", "reports", "add/tst1", "menu", "vehicle/tst1"]
# Käyttötilat: asennettu Koti-valikon sovellus (0.48) ja iPhonen Safari ilman asennusta (0.49)
TILAT = {
    "asennettu": dict(asennettu=True, ios=True),
    "safari": dict(ios=True),
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
    laiteLeveys: document.querySelector('.device').getBoundingClientRect().width,
    otsakeKorkeus: document.querySelector('.demo-header').getBoundingClientRect().height,
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
            if tila == "safari" and "fullscreen" not in m["luokka"].split():
                virheet.append(f"#{v}: Safari ei saanut koko ruudun näkymää (luokat: {m['luokka']})")
            if tila == "safari" and (m["laiteLeveys"] > 560.5 or m["otsakeKorkeus"] > 41):
                virheet.append(f"#{v}: sisältö levinnyt tai yläpalkki liian korkea (leveys {m['laiteLeveys']:.0f}, palkki {m['otsakeKorkeus']:.0f})")
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


def _kunnossa(m, odotettu_zoom):
    assert m["yli"] <= 0, m
    assert abs(m["zoom"] - odotettu_zoom) < 0.001, m
    assert m["tabAla"] <= m["ikkuna"] + 0.5 and m["tabYla"] >= 0, m


@pytest.mark.parametrize("alku", [(390, 844), (844, 390)], ids=["pysty-vaaka-pysty", "vaaka-pysty-vaaka"])
def test_kaantaminen_kesken_kaiken_safarissa(browser, base, alku):
    """Safari ei ole sivun latauksen jälkeen eri tilassa: luokka päätetään puhelimesta, ei suunnasta."""
    s = avaa(browser, base, "home", autot=tiedot.talli(), leveys=alku[0], korkeus=alku[1], kello=KELLO, ios=True)
    try:
        for (l, k) in [alku, alku[::-1], alku]:
            s.page.set_viewport_size({"width": l, "height": k})
            s.page.wait_for_timeout(400)
            m = s.page.evaluate(MITTAUS)
            assert "fullscreen" in m["luokka"].split(), (l, k, m)
            _kunnossa(m, 1.12)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tietokoneen_matala_ikkuna_ei_muutu(browser, base):
    """Hiirellä käytettävä selain (ei kosketusta) pitää puhelinkehyksen myös matalassa ikkunassa."""
    s = avaa(browser, base, "home", autot=tiedot.talli(), leveys=1000, korkeus=420, mobiili=False, kello=KELLO)
    try:
        luokat = s.page.evaluate("document.documentElement.className").split()
        assert "fullscreen" not in luokat and "standalone" not in luokat, luokat
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
