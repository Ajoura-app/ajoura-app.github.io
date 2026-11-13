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
# 2.18: Valikko on alasivu (← Koti, kuten Asetukset), ja tankkauskirjassa on aina ← Raportit, joten otsikko on
# paluulinkin alla.
@pytest.mark.parametrize("nakyma,logo,otsikko", [("home", 1, "Etusivu"), ("fuel/tst1", 0, "Tankkaus"), ("reports", 0, "Raportit"),
                                                 ("fuel/tst1/ajoneuvo", 0, "Tankkaus")])
def test_ylaosa(browser, base, leveys, nakyma, logo, otsikko):
    s = avaa(browser, base, nakyma, autot=tiedot.talli(), leveys=leveys, kello=KELLO)
    try:
        if nakyma=='home':
            p=s.page
            assert p.locator('.cinematic-brand').is_visible()
            assert p.locator('.cinematic-brand a[href="#newcar"]').is_visible()
            assert p.locator('.cinematic-brand a[href="#me/tili"]').is_visible()
            assert p.locator('.cinematic-brand a.top-menu[href="#menu"]').is_visible()  # 2.18
            assert p.locator('.app-top').is_hidden()
            assert p.evaluate('document.querySelector("#app-screen").scrollWidth<=document.querySelector("#app-screen").clientWidth')
            assert not s.virheet,s.virheet
            return
        r = s.page.evaluate(JS)
        assert r["logo"] == logo and r["oikealla"] and r["alla"] and r["paalle"] == 0 and r["sivu"] <= 0, r
        if otsikko:
            assert r["otsikko"] == otsikko, r
        if not logo and nakyma == "reports":
            assert r["otsikkoYla"] < 20, r  # otsikko ylimpänä (ennen logo- ja painikerivi sen yllä)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# The approved welcome has its own header; the old .app-top remains hidden there.
# Check the actual welcome controls instead of measuring a hidden start link.
@pytest.mark.parametrize("leveys", [320, 390, 430])
def test_tervetulon_oma_ylaosa_ja_paluu(browser, base, leveys):
    s = avaa(browser, base, "welcome", autot=tiedot.talli(), leveys=leveys, kello=KELLO)
    try:
        p=s.page;before=s.talli()
        assert p.locator(".app-top").is_hidden()
        assert p.locator(".ai-welcome-heading h1").is_visible()
        assert p.locator('[data-pref=Kieli]').count()==0
        assert p.evaluate("localStorage.getItem('ajoura-lang')")=='fi'
        assert p.evaluate('document.querySelector("#app-screen").scrollWidth<=document.querySelector("#app-screen").clientWidth')
        p.locator('.welcome-choices a[href="#home"]').click()
        p.wait_for_selector('.secretary-home')
        assert p.url.endswith('#home') and s.talli()==before
        assert not s.virheet,s.virheet
    finally:s.sulje()


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


# Visual-first 01: one compact header, with the logo aligned to the title and accessible start controls.
KOMPAKTI_JS = """() => {const q=s=>document.querySelector(s),r=s=>q(s).getBoundingClientRect();
 const sc=r('.screen-content'),h=r('.cinematic-brand'),a=[...q('.cinematic-brand').querySelectorAll('a')].map(e=>e.getBoundingClientRect()),v=r('.vehicle-home-card');
 return {korkeus:h.height,kosketus:Math.min(...a.map(x=>Math.min(x.width,x.height))),korttiin:v.top-h.bottom,oikea:sc.right-h.right,vasen:h.left-sc.left};}"""


@pytest.mark.parametrize("leveys,kieli,teema,asennettu", [(320, "fi", None, True), (390, "fi", None, True), (430, "fi", "dark", True),
                                                          (390, "en", None, False), (320, "sv", None, False)])
def test_etusivun_kompakti_ylaosa(browser, base, leveys, kieli, teema, asennettu):
    s = avaa(browser, base, "home", autot=tiedot.talli(), leveys=leveys, kieli=kieli, teema=teema, asennettu=asennettu, ios=True, kello=KELLO)
    try:
        r = s.page.evaluate(KOMPAKTI_JS)
        assert 0 <= r["vasen"] <= 24 and 44 <= r["korkeus"] <= 76, r
        assert r["kosketus"] >= 44 and r["korttiin"] >= 4 and r["oikea"] <= 24, r
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
