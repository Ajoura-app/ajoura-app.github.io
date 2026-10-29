"""9. Raportit ja Tankkaus: ajoneuvokuvat (0.50, 0.55), kululajit (0.51), ajoneuvon valinta (0.52) ja ajoneuvokortit (0.53)."""
import pytest

import tiedot
from apu import KELLO, avaa

M, T = tiedot.merkinta, tiedot.tankkaus
PYSTY = tiedot.jpeg((200, 40, 40), koko=(30, 60))  # pystykuva: vanha cover-rajaus leikkasi ajoneuvon pois


def talli(kuva=PYSTY):
    """Kolme ajoneuvoa, joista kahdella oma kuva; kulut neljässä lajissa (polttoaine, huollot, korjaukset, muut)."""
    return [
        tiedot.auto("a1", name="Testi Pakettiauto", plate="TST-201", body="panel", photo=kuva, events=[
            M("x1", "Korjaus ja osan vaihto", "2026-03-02", 140000, cost="496"),
            M("x2", "Huolto", "2026-05-10", 143000, cost="285")],
            fuels=[T("f1", "2026-09-01", 148000, 60, 110), T("f2", "2026-10-01", 149500, 70, 124)]),
        tiedot.auto("a2", name="Testi Farmari", plate="TST-202", photo=tiedot.jpeg((240, 240, 240), koko=(60, 30)),
                    events=[M("y1", "Huolto", "2026-04-01", 85000, cost="190")]),
        tiedot.auto("a3", name="Testi Asuntoauto", plate="TST-203", body="motorhome",
                    events=[M("z1", "Pesu ja hoito", "2026-10-21", 60000, cost="60")]),
    ]


RP = {"ajoura-reports": '{"p":"12","t":"sum"}'}


# 0.55: oma kuva täyttää ruudun tarkasti (cover, ei sumennettua kopiota 0.50:n tapaan), rajaus painottuu kuvan
# alaosaan (ajoneuvo on puhelinkuvassa yleensä alempana), eikä kuva veny ruudun ulkopuolelle (0.55:n korjaama vika:
# kuva näkyi omassa korkeudessaan, jolloin ruudussa näkyi kuvan yläosa).
KUVA_JS = """sel => [...document.querySelectorAll(sel)].filter(b => b.querySelector('img')).map(b => {
    const im = b.querySelector('img'), r = b.getBoundingClientRect(), f = im.getBoundingClientRect(), cs = getComputedStyle(im);
    return {luokka: im.className, fit: cs.objectFit, y: parseFloat(cs.objectPosition.split(' ')[1]), kpl: b.querySelectorAll('img').length,
            sama: Math.abs(f.left - r.left) < 1 && Math.abs(f.top - r.top) < 1 && Math.abs(f.width - r.width) < 1 && Math.abs(f.height - r.height) < 1,
            ladattu: im.naturalWidth > 0, korkeus: r.height};})"""


@pytest.mark.parametrize("nakyma,laatikko,extra", [
    ("fuel/a1", ".fl-cpic", {}),
    ("reports", ".fl-cpic", RP),
    ("reports", ".rp-vpic", RP),
    ("reports", ".rp-rthumb", {"ajoura-reports": '{"p":"12","t":"cars"}'}),
])
@pytest.mark.parametrize("teema", [None, "dark"])
def test_oma_kuva_tayttaa_ruudun(browser, base, nakyma, laatikko, extra, teema):
    s = avaa(browser, base, nakyma, autot=talli(), extra=extra, teema=teema, kello=KELLO)
    try:
        tulos = s.page.evaluate(KUVA_JS, laatikko)
        assert len(tulos) == 2, tulos  # kaksi ajoneuvoa, joilla on oma kuva
        for t in tulos:
            assert t["luokka"] == "own-ph" and t["kpl"] == 1 and t["ladattu"], t
            assert t["fit"] == "cover" and t["sama"] and 55 <= t["y"] <= 80 and t["korkeus"] > 20, t
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tankkausikkunan_kuva(browser, base):
    s = avaa(browser, base, "fuel/a1", autot=talli(), kello=KELLO)
    try:
        s.page.click("button.fl-add")
        s.page.wait_for_selector(".sheet-thumb img.own-ph")
        t = s.page.evaluate(KUVA_JS, ".sheet-thumb")[0]
        assert t["fit"] == "cover" and t["sama"], t
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def kuusi_lajia():
    t = talli()
    t[2]["events"] += [M("z2", "Katsastus", "2026-06-01", 60000, cost="55"), M("z3", "Renkaiden vaihto", "2026-06-02", 60000, cost="70")]
    return t


LAJIT_JS = """() => {const L = [...document.querySelectorAll('.rp-kinds li')], top = L.map(l => Math.round(l.getBoundingClientRect().top));
  return {n: L.length, rivit: [...new Set(top)].map(y => top.filter(x => x === y).length),
          yli: [...document.querySelectorAll('.rp-kt small, .rp-kt b')].filter(e => e.scrollWidth > e.clientWidth + 1
                 || e.getBoundingClientRect().right > e.closest('li').getBoundingClientRect().right + 1).map(e => e.textContent)};}"""


# 0.51: Kulut kategorioittain: enintään neljä lajia yhdelle riville, viisi tai kuusi kolmen riveihin, kapeimmalla kaksi.
@pytest.mark.parametrize("kieli", ["fi", "en", "sv"])
@pytest.mark.parametrize("leveys,nelja,kuusi", [(390, [4], [3, 3]), (430, [4], [3, 3]), (320, [2, 2], [2, 2, 2])])
def test_kululajit_rivit(browser, base, kieli, leveys, nelja, kuusi):
    for autot, odotus in [(talli(), nelja), (kuusi_lajia(), kuusi)]:
        s = avaa(browser, base, "reports", autot=autot, kieli=kieli, leveys=leveys, extra=RP, kello=KELLO)
        try:
            r = s.page.evaluate(LAJIT_JS)
            assert r["rivit"] == odotus and not r["yli"], r
            assert not s.virheet, s.virheet
        finally:
            s.sulje()


def _rp(s):
    return s.page.evaluate("""() => ({
        napit: [...document.querySelectorAll('.rp-cars [data-rp-only]')].map(b => [b.dataset.rpOnly, b.getAttribute('aria-pressed')]),
        kortit: [...document.querySelectorAll('.rp-vcard strong')].map(e => e.textContent),
        summa: document.querySelector('.rp-kpis b.big')?.textContent.replace(/\\s/g, ''),
        huom: document.querySelector('.rp-note')?.textContent || '',
        off: JSON.parse(localStorage.getItem('ajoura-reports') || '{}').offCars || []})""")


# 0.52: ajoneuvon valinta Yhteenvedon yläosassa yhdellä napautuksella; 0.54: ei Kaikki-nappia, paluu ilmoituksen
# "Näytä kaikki" -linkillä tai valitun ajoneuvon uudella napautuksella.
def test_ajoneuvon_valinta_yhteenvedossa(browser, base):
    s = avaa(browser, base, "reports", autot=talli(), extra=RP, kello=KELLO)
    try:
        r = _rp(s)
        assert r["napit"] == [["a1", "false"], ["a2", "false"], ["a3", "false"]], r  # kaikki näkyvissä, ei Kaikki-nappia
        assert r["summa"] == "1265€" and len(r["kortit"]) == 3 and not r["huom"], r
        s.page.click('[data-rp-only="a2"]'); s.page.wait_for_timeout(150)
        r = _rp(s)
        assert r["napit"] == [["a1", "false"], ["a2", "true"], ["a3", "false"]], r
        assert r["summa"] == "190€" and r["kortit"] == ["Testi Farmari"] and sorted(r["off"]) == ["a1", "a3"], r
        assert "ajoneuvoista" in r["huom"], r
        assert s.page.evaluate("document.activeElement?.dataset.rpOnly") == "a2"
        s.page.click('[data-rp-only="a3"]'); s.page.wait_for_timeout(150)
        assert _rp(s)["kortit"] == ["Testi Asuntoauto"]
        s.page.click('[data-rp-only="a3"]'); s.page.wait_for_timeout(150)  # valitun napautus palaa kaikkiin
        r = _rp(s)
        assert r["napit"] == [["a1", "false"], ["a2", "false"], ["a3", "false"]] and len(r["kortit"]) == 3 and r["off"] == [], r
        assert s.page.evaluate("document.activeElement?.dataset.rpOnly") == "a3"
        s.page.click('[data-rp-only="a1"]'); s.page.wait_for_timeout(150)
        s.page.click('[data-rp-reset]'); s.page.wait_for_timeout(150)  # Näytä kaikki
        assert _rp(s)["off"] == [] and _rp(s)["summa"] == "1265€" and not _rp(s)["huom"]
        # Useampi ajoneuvo Näytä tarkemmin -kohdasta: valitut näkyvät valittuina myös yläosassa.
        s.page.click("[data-rp-more]"); s.page.click('[data-rp-car="a3"]'); s.page.wait_for_timeout(150)
        r = _rp(s)
        assert r["napit"] == [["a1", "true"], ["a2", "true"], ["a3", "false"]], r
        # Kululajin rajaus näyttää yhteisen ilmoituksen.
        s.page.click('[data-rp-kind="fuel"]'); s.page.wait_for_timeout(150)
        assert "kululajeista" in _rp(s)["huom"] and "ajoneuvoista" in _rp(s)["huom"]
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.54: ajoneuvonapit rivittyvät eivätkä mene ruudun yli (Tankkaus, Vertailu, Raportit), myös kuudella ajoneuvolla.
NAPIT_JS = """() => {const sc = document.querySelector('.screen-content').getBoundingClientRect();
  const b = [...document.querySelectorAll('.fl-cars .fl-car')];
  return {n: b.length, yli: b.filter(e => {const r = e.getBoundingClientRect(); return r.left < sc.left - 0.5 || r.right > sc.right + 0.5;}).length,
          vieritys: [...document.querySelectorAll('.fl-cars')].some(e => e.scrollWidth > e.clientWidth + 1)};}"""


@pytest.mark.parametrize("leveys", [320, 390, 430])
@pytest.mark.parametrize("nakyma,extra", [("reports", RP), ("fuel/a1", {}),
                                          ("fuel/a1", {"ajoura-fuel": '{"p":"12","t":"cmp"}'})])
def test_ajoneuvonapit_ruudulla(browser, base, leveys, nakyma, extra):
    autot = talli() + [tiedot.auto(f"b{i}", name=f"Lisäauto {i}", plate=f"TST-30{i}",
                                   fuels=[T(f"g{i}1", "2026-09-01", 1000, 40, 70), T(f"g{i}2", "2026-10-01", 1600, 40, 70)])
                       for i in range(3)]
    for a in autot[:3]:
        a.setdefault("fuels", [])
    autot[1]["fuels"] = [T("h1", "2026-09-01", 85000, 40, 70), T("h2", "2026-10-01", 85700, 40, 70)]
    s = avaa(browser, base, nakyma, autot=autot, leveys=leveys, extra=extra, kello=KELLO)
    try:
        r = s.page.evaluate(NAPIT_JS)
        assert r["n"] == 6 and r["yli"] == 0 and not r["vieritys"], r
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_yksi_ajoneuvo_ilman_valintaa(browser, base):
    s = avaa(browser, base, "reports", autot=talli()[:1], extra=RP, kello=KELLO)
    try:
        assert s.page.locator(".rp-cars").count() == 0
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.53: ajoneuvokortin selitteessä kululajin nimi summan vieressä, muutoksen vertailujakso näkyvissä ja pieni €/km "< 0,01".
@pytest.mark.parametrize("kieli,nimi,vs", [("fi", "Korjaukset", "verrattuna edellisiin 12 kk"),
                                           ("en", "Repairs", "compared with the previous 12 months"),
                                           ("sv", "Reparationer", "jämfört med föregående 12 mån")])
def test_ajoneuvokortin_selite(browser, base, kieli, nimi, vs):
    autot = talli()
    autot[0]["events"].append(M("x0", "Huolto", "2025-06-01", 130000, cost="300"))  # vertailujaksolle kuluja → muutos
    autot.append(tiedot.auto("a4", name="Testi Halpa", plate="TST-204", km=120000,
                             events=[M("w1", "Pesu ja hoito", "2025-11-01", 100000, cost="1")]))
    s = avaa(browser, base, "reports", autot=autot, kieli=kieli, extra=RP, kello=KELLO)
    try:
        kortti = s.page.locator(".rp-vcard", has_text="Testi Pakettiauto")
        leg = kortti.locator(".rp-leg > span").all_inner_texts()
        assert any(nimi in x and "496" in x for x in leg), leg
        assert kortti.locator(".rp-leg .sr-only").count() == 0  # nimet näkyvät, eivät vain ruudunlukijalle
        assert kortti.locator(".rp-delta").count() == 1
        assert vs in s.page.inner_text(".rp-vs-note")
        assert "< 0,01" in s.page.locator(".rp-vcard", has_text="Testi Halpa").inner_text().replace(" ", " ")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
