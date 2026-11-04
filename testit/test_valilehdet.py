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
    ajoneuvoikkunan sisällön (Koti-näkymän tilarivi ja napit) ja kuvakkeet ovat tasavälein. 0.88: napit ovat kortin
    oikeassa reunassa, joten leveyttä verrataan täysleveään tilariviin."""
    s = avaa(browser, base, "home", autot=[tiedot.auto()], leveys=leveys, kello=KELLO)
    try:
        r = s.page.evaluate("""() => {const n = document.querySelector('.main-tabs'), b = n.getBoundingClientRect(),
          g = document.querySelector('#app-screen').getBoundingClientRect(), k = document.querySelector('.garage-row .row-wide').getBoundingClientRect(),
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


# 0.75: alavalikon kapseli on alustalla (.tab-dock), jonka tausta on näkymän taustaväri: sisältö ei näy kapselin
# ympäriltä eikä alta, sivun lopussa viimeinen kortti jää kokonaan näkyviin kapselin yläpuolelle (myös iPhonen
# kotipalkin alueen kanssa), varjo on kevyt ja tummassa tilassa ei ole hehkua. Näppäimistön ollessa auki alusta piiloon.
LOPPU_JS = """() => {const sc = document.querySelector('#app-screen'); sc.scrollTop = sc.scrollHeight;
  const n = document.querySelector('.main-tabs'), d = n.closest('.tab-dock'), b = n.getBoundingClientRect(), g = sc.getBoundingClientRect();
  const sis = [...document.querySelectorAll('.screen-content > *')].filter(e => e.getBoundingClientRect().height);
  const viim = sis[sis.length - 1].getBoundingClientRect(), dc = d && getComputedStyle(d), nc = getComputedStyle(n);
  return {alusta: !!d, rako: b.top - viim.bottom, alaReuna: d ? g.bottom - d.getBoundingClientRect().bottom : null,
          kapseliAla: g.bottom - b.bottom, tausta: dc ? dc.backgroundImage : '', sticky: dc ? dc.position : '',
          varjo: nc.boxShadow, sumeus: Math.max(0, ...[...nc.boxShadow.matchAll(/(\\d+(?:\\.\\d+)?)px (\\d+(?:\\.\\d+)?)px (\\d+(?:\\.\\d+)?)px/g)].map(m => +m[3]))};}"""


@pytest.mark.parametrize("teema", [None, "dark"])
@pytest.mark.parametrize("kotipalkki", [0, 34])
@pytest.mark.parametrize("nakyma,extra", [("reports", {"ajoura-reports": '{"p":"year","t":"sum"}'}), ("fuel/tst1", {}), ("home", {})])
def test_alavalikko_ei_peita_sisaltoa(browser, base, teema, kotipalkki, nakyma, extra):
    s = avaa(browser, base, nakyma, autot=tiedot.talli(), teema=teema, extra=extra, asennettu=True, ios=True, kello=KELLO)
    try:
        if kotipalkki:  # iPhonen kotipalkin alue (safe-area-inset-bottom)
            s.context.new_cdp_session(s.page).send("Emulation.setSafeAreaInsetsOverride", {"insets": {"top": 47, "bottom": kotipalkki}})
            s.page.wait_for_timeout(200)
        r = s.page.evaluate(LOPPU_JS)
        s.page.wait_for_timeout(150)
        r = s.page.evaluate(LOPPU_JS)
        assert r["alusta"] and r["sticky"] == "sticky" and "gradient" in r["tausta"], r
        assert r["alaReuna"] <= 0.5, r  # alusta ulottuu näytön alareunaan asti: sisältö ei näy kapselin alta
        assert 12 <= r["rako"] <= 60, r  # viimeinen kortti kokonaan kapselin yläpuolella, ei ylisuurta tyhjää
        assert r["kapseliAla"] <= (kotipalkki - 12 if kotipalkki else 10) + 1, r  # 0.74:n paikka säilyy
        if teema == "dark":
            assert r["varjo"] == "none", r  # käänteisvärisuodatin tekisi varjosta vaalean hehkun
        else:
            assert 0 < r["sumeus"] <= 14, r
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_alavalikko_piiloon_kirjoitettaessa(browser, base):
    s = avaa(browser, base, "feedback", autot=[tiedot.auto()], kello=KELLO)
    try:
        assert s.page.locator(".tab-dock").is_visible()
        s.page.focus("#app-screen textarea")
        assert not s.page.locator(".tab-dock").is_visible()
        s.page.evaluate("document.activeElement.blur()")
        assert s.page.locator(".tab-dock").is_visible()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
