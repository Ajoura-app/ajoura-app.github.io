"""9. Raportit ja Tankkaus: ajoneuvokuvat (0.50), kululajit (0.51), ajoneuvon valinta (0.52) ja ajoneuvokortit (0.53)."""
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


# 0.50: oma kuva näkyy kokonaisena (contain) eikä rajaudu; kuvan alla sumennettu kopio.
@pytest.mark.parametrize("nakyma,laatikko,extra", [
    ("fuel/a1", ".fl-cpic", {}),
    ("reports", ".rp-vpic", RP),
    ("reports", ".rp-rthumb", {"ajoura-reports": '{"p":"12","t":"cars"}'}),
])
@pytest.mark.parametrize("teema", [None, "dark"])
def test_oma_kuva_kokonaan(browser, base, nakyma, laatikko, extra, teema):
    s = avaa(browser, base, nakyma, autot=talli(), extra=extra, teema=teema, kello=KELLO)
    try:
        tulos = s.page.evaluate("""sel => [...document.querySelectorAll(sel)].filter(b => b.querySelector('img')).map(b => {
            const fg = b.querySelector('img.ph-fg'), bg = b.querySelector('img.ph-bg'), r = b.getBoundingClientRect();
            if (!fg || !bg) return {puuttuu: true};
            const f = fg.getBoundingClientRect(), k = Math.min(f.width / fg.naturalWidth, f.height / fg.naturalHeight);
            const w = fg.naturalWidth * k, h = fg.naturalHeight * k;  // kuvan näkyvä osa contain-sovituksessa
            return {fit: getComputedStyle(fg).objectFit, bgfit: getComputedStyle(bg).objectFit, blur: getComputedStyle(bg).filter,
                    mahtuu: w <= r.width + 0.5 && h <= r.height + 0.5 && f.left >= r.left - 0.5 && f.right <= r.right + 0.5,
                    ladattu: fg.naturalWidth > 0};})""", laatikko)
        assert len(tulos) == 2, tulos  # kaksi ajoneuvoa, joilla on oma kuva
        for t in tulos:
            assert not t.get("puuttuu"), tulos
            assert t["ladattu"] and t["fit"] == "contain" and t["bgfit"] == "cover" and t["mahtuu"], t
            assert "blur" in t["blur"], t
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tankkausikkunan_kuva_kokonaan(browser, base):
    s = avaa(browser, base, "fuel/a1", autot=talli(), kello=KELLO)
    try:
        s.page.click("button.fl-add")
        s.page.wait_for_selector(".sheet-thumb img.ph-fg")
        assert s.page.eval_on_selector(".sheet-thumb img.ph-fg", "e => getComputedStyle(e).objectFit") == "contain"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
