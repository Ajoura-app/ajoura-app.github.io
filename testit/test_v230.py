"""2.30 (Niklas): kartta koko näkymälle. Alavalikko, ⋯-valikko ja yläkulman painikkeet kelluvat kartan päällä;
kartan alareunan säätimet ja lähdemerkintä jäävät alavalikon yläpuolelle. Ajopäiväkirja pysyy tavallisena näkymänä."""
import pytest

from apu import avaa
from test_v225 import odota_tila, tyyli
import tiedot

MITAT = """() => {const r = s => document.querySelector(s)?.getBoundingClientRect(), sc = r('#app-screen'), k = r('.kartta'),
  nav = r('#app-screen > .tab-dock .tab-bar'), z = r('.kartta-zoom'), a = r('.maplibregl-ctrl-bottom-left'), m = r('.kartta-yla .top-menu'),
  osuu = el => { const b = document.querySelector(el).getBoundingClientRect(); return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest(el) !== null; },
  e = document.getElementById('app-screen');
  return {sc: [sc.left, sc.top, sc.width, sc.height], k: [k.left, k.top, k.width, k.height], navTop: nav.top, navBottom: nav.bottom,
          zoomBottom: z.bottom, attrBottom: a.bottom, menu: [m.width, m.height], valikko: osuu('.kartta-yla .top-menu'),
          zoom: osuu('[data-kartta-zoom=in]'), sijainti: osuu('[data-kartta-sijainti]'), vieritys: e.scrollHeight - e.clientHeight};}"""


@pytest.mark.parametrize("leveys,korkeus", [(320, 568), (390, 844), (430, 932)])
@pytest.mark.parametrize("teema", [None, "dark"])
def test_kartta_koko_nakymalle(browser, base, leveys, korkeus, teema):
    s = avaa(browser, base, "home", autot=tiedot.talli(), leveys=leveys, korkeus=korkeus, teema=teema, asennettu=True)
    try:
        tyyli(s)
        s.page.locator('.main-tabs a[aria-label="Kartta"]').click()
        odota_tila(s, "ready")
        r = s.page.evaluate(MITAT)
        assert all(abs(a - b) <= 1 for a, b in zip(r["k"], r["sc"])), r  # kartta täyttää näkymän
        assert r["navBottom"] <= r["sc"][1] + r["sc"][3] + 1 and r["navTop"] < r["k"][1] + r["k"][3], r  # alavalikko kartan päällä
        assert r["zoomBottom"] <= r["navTop"] and r["attrBottom"] <= r["navTop"], r  # säätimet alavalikon yläpuolella
        assert r["menu"][0] >= 44 and r["menu"][1] >= 44 and r["valikko"] and r["zoom"] and r["sijainti"], r
        assert r["vieritys"] <= 1, r  # näkymä ei vieri
        assert s.page.locator(".kartta-yla h2").inner_text() == "Kartta"  # otsikko ruudunlukijalle
        s.page.locator(".kartta-yla .top-menu").click()
        s.page.wait_for_function("location.hash === '#menu'")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_muut_nakymat_ennallaan(browser, base):
    s = avaa(browser, base, "home", autot=tiedot.talli())
    try:
        tyyli(s)
        s.page.locator('.main-tabs a[aria-label="Kartta"]').click()
        odota_tila(s, "ready")
        s.page.locator('.main-tabs a[aria-label="Raportit"]').click()
        s.page.wait_for_selector(".rp-head")
        assert s.page.evaluate("getComputedStyle(document.querySelector('#app-screen > .tab-dock')).position") == "sticky"
        assert s.page.evaluate("getComputedStyle(document.querySelector('#app-screen')).overflowY") == "auto"
    finally:
        s.sulje()
