"""0.95: mittarilukemat, jotka ovat ristiriidassa päivämäärien kanssa (suurempi lukema aiemmalla päivällä kuin pienempi,
esim. 156 850 km 28.10. ja 156 848 km 1.11.), eivät päädy kulutukseen. Kaikki välit, joihin ristiriitainen tankkaus
kuuluu, jätetään pois (ei yhdistetä), tallennettu tieto ei muutu ja tankkaukset merkitään "Tarkista mittarilukema"."""
import pytest

import tiedot
from apu import KELLO, avaa

T = tiedot.tankkaus


def talli():
    # o4 (26.10., 151 502 km) ja o5 (28.10., 151 500 km): lukemat väärinpäin päivämääriin nähden.
    f = [T("o1", "2026-09-01", 150000, 40.0, 70.0), T("o2", "2026-09-20", 150500, 30.0, 54.0),
         T("o3", "2026-10-10", 151000, 35.0, 63.0), T("o4", "2026-10-26", 151502, 35.0, 63.0),
         T("o5", "2026-10-28", 151500, 3.0, 5.4)]
    return [tiedot.auto(km=151502, fuels=f)]


JS = """() => ({iso: document.querySelector('.fl-big')?.innerText.replace(/\\s+/g, ' '),
  huom: document.querySelector('.fl-ord')?.innerText.replace(/\\s+/g, ' ') || '',
  rivit: [...document.querySelectorAll('[data-fl-edit]')].filter(r => r.querySelector('.fl-sus')).map(r => r.dataset.flEdit).sort()})"""


@pytest.mark.parametrize("kieli,otsikko", [("fi", "Mittarilukemat ristiriidassa päivämäärien kanssa"),
                                           ("en", "Odometer readings contradict the dates"),
                                           ("sv", "Mätarställningarna stämmer inte med datumen")])
def test_ristiriitaiset_lukemat_pois_kulutuksesta(browser, base, kieli, otsikko):
    s = avaa(browser, base, "fuel/tst1", autot=talli(), kieli=kieli, extra={"ajoura-fuel": '{"p":"12","t":"car"}'}, kello=KELLO)
    try:
        s.page.evaluate("document.querySelectorAll('details.fl-g').forEach(d => d.open = true)")
        r = s.page.evaluate(JS)
        # (30 + 35) l / 1 000 km = 6,5. Ennen 0.95: 3 l / 500 km -väli mukana → 4,5 (harhaanjohtava).
        assert "6,5" in r["iso"], r
        assert otsikko in r["huom"] and "26.10." in r["huom"] and "28.10." in r["huom"], r
        assert r["rivit"] == ["o4", "o5"], r
        assert [x["km"] for x in s.talli()["cars"][0]["fuels"]] == [150000, 150500, 151000, 151502, 151500]  # ennallaan
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_ei_riittavasti_tietoa(browser, base):
    """Kun kaikki välit koskevat ristiriitaista lukemaa, keskikulutusta ei näytetä numerona."""
    f = [T("a", "2026-10-01", 150000, 40.0, 70.0), T("b", "2026-10-10", 150510, 35.0, 63.0), T("c", "2026-10-20", 150500, 30.0, 54.0)]
    s = avaa(browser, base, "fuel/tst1", autot=[tiedot.auto(km=150510, fuels=f)], extra={"ajoura-fuel": '{"p":"12","t":"car"}'}, kello=KELLO)
    try:
        iso = s.page.inner_text(".fl-big")
        assert not any(ch.isdigit() for ch in iso.split("/")[0]), iso
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
