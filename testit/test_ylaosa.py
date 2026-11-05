"""0.103 (Niklas): AJOURA-logo vain etusivulla; Aloitussivu oikeassa reunassa ja TESTIVERSIO sen alla; muilla sivuilla
yläosa on otsikon rinnalla, joten sisältö alkaa ylempää. Tankkaus-sivun otsikko on "Tankkaus"."""
import pytest

import tiedot
from apu import KELLO, avaa

JS = """() => {const q = s => document.querySelector(s), r = s => q(s)?.getBoundingClientRect();
  const st = r('.r-start, .r-view-menu'), dl = r('.r-top-right .demo-label'), sc = r('.screen-content'), h = r('.app-heading');
  const muut = [...document.querySelectorAll('.screen-content > :not(.app-top):not(.app-heading):not(.rp-head):not(.app-back), .welcome > .prefs-bar, .welcome > *:first-child')]
    .map(e => e.getBoundingClientRect()).filter(b => b.height);
  const ryhma = r('.r-top-right');
  return {logo: document.querySelectorAll('.app-top .app-brand').length, otsikko: q('.app-heading')?.textContent,
    oikealla: Math.abs(st.right - dl.right) < 2 && sc.right - st.right < 24, alla: dl.top >= st.bottom - 0.5,
    paalle: muut.filter(b => b.top < ryhma.bottom - 0.5 && b.right > ryhma.left + 0.5 && b.left < ryhma.right - 0.5).length,
    otsikkoYla: h ? h.top - sc.top : null, sivu: q('#app-screen').scrollWidth - q('#app-screen').clientWidth};}"""


@pytest.mark.parametrize("leveys", [320, 390, 430])
@pytest.mark.parametrize("nakyma,logo,otsikko", [("home", 1, "Etusivu"), ("fuel/tst1", 0, "Tankkaus"), ("reports", 0, "Raportit"),
                                                 ("menu", 0, "Valikko"), ("fuel/tst1/ajoneuvo", 0, "Tankkaus"), ("welcome", 0, None)])
def test_ylaosa(browser, base, leveys, nakyma, logo, otsikko):
    s = avaa(browser, base, nakyma, autot=tiedot.talli(), leveys=leveys, kello=KELLO)
    try:
        r = s.page.evaluate(JS)
        assert r["logo"] == logo and r["oikealla"] and r["alla"] and r["paalle"] == 0 and r["sivu"] <= 0, r
        if otsikko:
            assert r["otsikko"] == otsikko, r
        if not logo and nakyma in ("fuel/tst1", "reports", "menu"):
            assert r["otsikkoYla"] < 20, r  # otsikko ylimpänä (ennen logo- ja painikerivi sen yllä)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("kieli,otsikko", [("en", "Fuel"), ("sv", "Tankning")])
def test_tankkaus_otsikko_kaannetty(browser, base, kieli, otsikko):
    s = avaa(browser, base, "fuel/tst1", autot=tiedot.talli(), kieli=kieli, kello=KELLO)
    try:
        assert s.page.inner_text(".app-heading") == otsikko
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
