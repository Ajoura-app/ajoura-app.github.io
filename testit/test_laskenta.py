"""0.76: Raportit- ja Tankkaus-välilehtien yhteinen laskenta: jaksot, kilometrit jaksolla, kuukausien määrä ja
vertailu samaan jaksoon vuotta aiemmin. Laskentafunktiot ovat sovelluksessa window.AjouraCalc-oliossa (vain luku).
Päivä on kiinteä 29.10.2026 (apu.KELLO)."""
import pytest

import tiedot
from apu import KELLO, avaa

M, T = tiedot.merkinta, tiedot.tankkaus


def auto(id, km, events=(), fuels=(), **k):
    return tiedot.auto(id, name="Laskenta " + id, plate="TST-9" + id[-2:], km=km, events=list(events), fuels=list(fuels), **k)


@pytest.fixture(scope="module")
def sivu(browser, base):
    s = avaa(browser, base, "home", autot=[tiedot.auto()], kello=KELLO)
    yield s
    s.sulje()


def km_in(s, c, a, b):
    return s.page.evaluate("([c, a, b]) => AjouraCalc.kmIn(c, a, b)", [c, a, b])


def test_jaksot(sivu):
    r = sivu.page.evaluate("""() => ({v: AjouraCalc.rpRange('year'), k: AjouraCalc.rpRange('12'),
        pv: AjouraCalc.rpPrev('year'), pk: AjouraCalc.rpPrev('12'), kaikki: AjouraCalc.rpPrev('all')})""")
    assert r["v"] == {"from": "2026-01-01", "to": "2026-10-29"}
    # 12 kk = 12 kalenterikuukautta kuluva kuukausi mukaan lukien (ennen 0.76: 29.10.2025 alkaen, 13 kuukautta)
    assert r["k"] == {"from": "2025-11-01", "to": "2026-10-29"}
    # Vertailujakso on sama jakso vuotta aiemmin (ennen 0.76: 12 kk verrattiin sitä edeltäviin 12 kuukauteen)
    assert r["pv"] == {"from": "2025-01-01", "to": "2025-10-29"} and r["pk"] == {"from": "2024-11-01", "to": "2025-10-29"}
    assert r["kaikki"] is None


def test_kuukaudet(sivu):
    m = lambda a, b: round(sivu.page.evaluate("([a, b]) => AjouraCalc.monthsIn(a, b)", [a, b]), 3)
    assert m("2026-01-01", "2026-12-31") == 12
    assert m("2026-01-01", "2026-11-03") == round(10 + 3 / 30, 3)  # 10,1 kk
    assert m("2025-11-01", "2026-10-29") == round(11 + 29 / 31, 3)
    assert m("2024-02-01", "2024-02-29") == 1  # karkausvuoden helmikuu


def test_kilometrit_interpoloidaan(sivu):
    # Lukemat 15.12.2025 (10 000) ja 15.1.2026 (11 000): vuoden alun lukema 10 000 + 1 000 · 17/31.
    c = auto("k1", 20000, events=[M("a", "Huolto", "2025-12-15", 10000), M("b", "Huolto", "2026-01-15", 11000)],
             fuels=[T("f", "2026-10-20", 19800, 40, 70)])
    r = km_in(sivu, c, "2026-01-01", "2026-10-29")
    assert r["ok"] and r["d"] == round(20000 - (10000 + 1000 * 17 / 31)), r


def test_elinkaaren_kilometrit_eivat_ole_jakson(sivu):
    """Raportin havainto (0,03 €/km, Ducato 14 250 km): vanha lukema vuosien takaa ja uudet tankkaukset. Ennen 0.76
    kaikki 14 250 km laskettiin tälle vuodelle; nyt jakson alun lukemaa ei tiedetä, joten €/km jää näyttämättä."""
    c = auto("k2", 150250, events=[M("a", "Huolto", "2023-06-01", 135750, cost="410")],
             fuels=[T("f1", "2026-10-12", 150000, 40, 70), T("f2", "2026-10-20", 150250, 45, 83)])
    r = km_in(sivu, c, "2026-01-01", "2026-10-29")
    assert not r["ok"] and r["gap"] > 92, r
    assert sivu.page.evaluate("c => AjouraCalc.kmIn(c, '2026-10-12', '2026-10-29').ok", c)  # tankkausväli on luotettava


def test_tiedot_alkavat_jakson_aikana(sivu):
    c = auto("k3", 88400, fuels=[T("f1", "2026-10-22", 88000, 30, 60)])
    r = km_in(sivu, c, "2026-01-01", "2026-10-29")
    assert r["ok"] and r["d"] == 400 and r["start"] == "2026-10-22", r
    # Kulu ilman mittarilukemaa ennen ensimmäistä lukemaa: kilometrit eivät kata kuluja → ei luotettava.
    c["events"] = [M("e", "Huolto", "2026-03-01", None, cost="200")]
    assert not km_in(sivu, c, "2026-01-01", "2026-10-29")["ok"]


def test_vertailun_kattavuus(sivu):
    c = auto("k4", 231400, events=[M("a", "Huolto", "2025-04-12", 205000, cost="306")],
             fuels=[T("f1", "2026-10-05", 230000, 45, 80)])
    ok = lambda pf, fuel: sivu.page.evaluate("([c, pf, f]) => AjouraCalc.covers(c, pf, f)", [c, pf, fuel])
    assert ok("2025-04-01", False)  # huoltokirja alkaa vertailujakson alussa
    assert not ok("2025-01-01", False)  # ensimmäinen kirjaus yli kuukausi vertailujakson alun jälkeen
    assert not ok("2025-04-01", True)  # tankkauksia kirjattu vasta 10/2026: polttoainekuluja ei voi verrata


RP_V = {"ajoura-reports": '{"p":"year","t":"sum"}'}


def kuvien_talli():
    """Kuvakaappausten tilanne keksityin tiedoin: huoltokirja vuodesta 2025, tankkaukset vasta lokakuusta 2026."""
    return [
        auto("vw1", 231400, events=[M("p1", "Huolto", "2025-04-12", 205000, cost="306"),
                                    M("p2", "Korjaus ja osan vaihto", "2026-05-14", 219500, cost="496")],
             fuels=[T("pf1", "2026-10-05", 230000, 45, 80), T("pf2", "2026-10-25", 231000, 48, 88)]),
        auto("fd1", 150250, body="panel", events=[M("d1", "Huolto", "2023-06-01", 135750, cost="410")],
             fuels=[T("df1", "2026-10-12", 150000, 40, 70), T("df3", "2026-10-26", 150250, 45, 83)]),
    ]


def test_raportit_ei_harhaanjohtavaa_vertailua(browser, base):
    s = avaa(browser, base, "reports", autot=kuvien_talli(), extra=RP_V, kello=KELLO)
    try:
        r = s.page.evaluate("""() => ({kpi: document.querySelector('.rp-total')?.innerText.replace(/\\s+/g, ' '),
            muutokset: document.querySelectorAll('.rp-delta').length,
            kortit: [...document.querySelectorAll('.rp-vcard')].map(e => e.innerText.replace(/\\s+/g, ' '))})""")
        # Ei muutosprosenttia: polttoainekuluja ei ole kirjattu vertailujaksolta (ennen 0.76: +299 % ja +230 %).
        assert r["muutokset"] == 0, r
        # Ei elinkaaren kilometreistä laskettua €/km:ää (ennen 0.76: 16 650 km ja < 0,01 €/km).
        assert "Ei riittävästi tietoja" in r["kpi"] and "km" not in r["kortit"][1].replace("€/km", ""), r
        assert all("< 0,01" not in k for k in r["kortit"]), r
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_muutos_kun_vertailujakso_kirjattu(browser, base):
    autot = kuvien_talli()[:1]
    autot[0]["fuels"][:0] = [T("v1", "2024-12-20", 190000, 50, 85), T("v2", "2025-05-20", 207000, 50, 90)]
    s = avaa(browser, base, "reports", autot=autot, extra=RP_V, kello=KELLO)
    try:
        d = s.page.locator(".rp-delta")
        assert d.count() >= 1
        varit = s.page.evaluate("() => [...document.querySelectorAll('.rp-delta')].map(e => getComputedStyle(e).color)")
        # Muutosta ei merkitä vihreäksi tai punaiseksi (0.76): ei rgb(11, 113, 72) eikä rgb(180, 42, 42).
        assert all(v not in ("rgb(11, 113, 72)", "rgb(180, 42, 42)") for v in varit), varit
        assert "verrattuna samaan jaksoon vuotta aiemmin" in s.page.inner_text(".screen-content")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("nakyma,extra,valitsin", [
    ("reports", {"ajoura-reports": '{"p":"12","t":"sum"}'}, ".rp-col"),
    ("fuel/fd1", {"ajoura-fuel": '{"p":"12","t":"car"}'}, ".fv-trend .fl-chart rect.hit"),
    ("fuel", {"ajoura-fuel": '{"p":"12","t":"cmp","m":"cost"}'}, ".fl-chart rect.hit"),
])
def test_12_kk_on_12_kuukautta(browser, base, nakyma, extra, valitsin):
    autot = kuvien_talli()
    autot[1]["fuels"].insert(0, T("df0", "2025-11-05", 140000, 40, 70))
    # 0.96: kulutuksen kehitys piirretään vasta, kun mitattuja kuukausia on vähintään kaksi (tässä kesä- ja lokakuu).
    autot[1]["fuels"].insert(1, T("df05", "2026-06-01", 145000, 200, 350))
    s = avaa(browser, base, nakyma, autot=autot, extra=extra, kello=KELLO)
    try:
        assert s.page.locator(valitsin).count() == 12  # marras 2025 – loka 2026 (ennen 0.76: 13 pylvästä)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
