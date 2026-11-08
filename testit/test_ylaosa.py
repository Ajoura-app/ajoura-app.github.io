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


SANAT_JS = """() => {const c = document.createElement('span'); document.body.appendChild(c);
  const out = [...document.querySelectorAll('.fv-lab2')].map(e => {c.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:' + getComputedStyle(e).font + ';letter-spacing:' + getComputedStyle(e).letterSpacing;
    const pisin = Math.max(...e.textContent.split(/[\\s\\u00ad]+/).map(w => {c.textContent = w; return c.getBoundingClientRect().width;}));
    return [e.textContent, pisin <= e.getBoundingClientRect().width + 0.5];}); c.remove(); return out.filter(x => !x[1]).map(x => x[0]);}"""


@pytest.mark.parametrize("kieli", ["fi", "en", "sv"])
@pytest.mark.parametrize("leveys", [320, 360, 390, 430])
@pytest.mark.parametrize("nakyma", ["reports", "fuel/tst1", "fuel/tst2"])
def test_kortin_otsikko_ei_katkea_kesken_sanan(browser, base, kieli, leveys, nakyma):
    """0.104: 0.102:ssa 320 px:n leveydellä "Kokonaiskulut" katkesi muotoon "Kokonaiskulu / t"."""
    s = avaa(browser, base, nakyma, autot=tiedot.talli(), kieli=kieli, leveys=leveys, kello=KELLO)
    try:
        assert s.page.evaluate(SANAT_JS) == []
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.108 (Niklas): etusivun AJOURA-logo keskellä; Aloitussivu ja TESTIVERSIO Etusivu-otsikon tasalla (ryhmän
# pystykeskikohta = otsikon keskikohta), eivät otsikon tai Tänään-kortin päällä. Myös asennettuna, tummana ja kielillä.
KESKI_JS = """() => {const r = s => document.querySelector(s).getBoundingClientRect();
  const sc = r('.screen-content'), lg = r('.app-top .app-brand'), g = r('.r-top-right'), h = r('.home-heading'), t = r('.secretary-selector');
  const txt = document.createRange(); txt.selectNodeContents(document.querySelector('.home-heading')); const tx = txt.getBoundingClientRect();
  return {logoKeski: (lg.left + lg.right) / 2 - (sc.left + sc.right) / 2, ryhmaKeski: (g.top + g.bottom) / 2 - (h.top + h.bottom) / 2,
          tekstiin: g.left - tx.right, korttiin: t.top - g.bottom, oikea: sc.right - g.right};}"""


@pytest.mark.parametrize("leveys,kieli,teema,asennettu", [(320, "fi", None, True), (390, "fi", None, True), (430, "fi", "dark", True),
                                                          (390, "en", None, False), (320, "sv", None, False)])
def test_etusivun_logo_keskella(browser, base, leveys, kieli, teema, asennettu):
    s = avaa(browser, base, "home", autot=tiedot.talli(), leveys=leveys, kieli=kieli, teema=teema, asennettu=asennettu, ios=True, kello=KELLO)
    try:
        r = s.page.evaluate(KESKI_JS)
        assert abs(r["logoKeski"]) <= 1, r
        assert abs(r["ryhmaKeski"]) <= 1.5 and r["tekstiin"] >= 8 and r["korttiin"] >= 4 and r["oikea"] <= 24, r
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
