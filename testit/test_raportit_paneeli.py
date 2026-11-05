"""0.102 (Niklas): Raportit-välilehti Tankkaus-välilehden ilmeellä ja toiminnoilla.

Ylärivi: ajoneuvo (Kaikki ajoneuvot tai yksi), aikaväli (samat seitsemän kuin Tankkauksessa) ja Lisää merkintä.
Neljä tunnuslukukorttia (Kokonaiskulut, Keskimäärin / kk, Polttoaine ja lataus, Huollot ja korjaukset), joilla voi olla
oma aikaväli; kuukausikaavio, kulujen jakautuminen neljään luokkaan, ajoneuvokohtaiset kulut ja vienti. Widgettien
järjestys pitkällä painalluksella kuten Tankkauksessa. Kokonaiskulut = polttoaine + huollot + korjaukset + muut, eikä
kululajin piilotus kaaviosta muuta yhtään summaa.
"""
import json
import subprocess
import shutil

import pytest

import tiedot
from apu import KELLO, avaa
from test_raportit import talli

M, T = tiedot.merkinta, tiedot.tankkaus
VUOSI = {"ajoura-reports": '{"p":"year"}'}
OLETUS = ["tot", "mon", "fuel", "svc", "months", "dist", "cars", "exp"]
# talli(), Tämä vuosi (1.1.–29.10.2026): polttoaine 110 + 124, huollot 285 + 190, korjaukset 496, muut 60 (pesu).
POLTTO, HUOLLOT, KORJAUKSET, MUUT = 234, 475, 496, 60
YHT = POLTTO + HUOLLOT + KORJAUKSET + MUUT


def nro(t):
    return int("".join(ch for ch in (t or "") if ch.isdigit()) or 0)


def kortti(pg, k):
    return nro(pg.inner_text(f"[data-fw={k}] .fv-val"))


def jakso(pg, k):
    return pg.inner_text(f"[data-fw={k}] .fv-per").strip()


def prefs(pg):
    return json.loads(pg.evaluate("localStorage.getItem('ajoura-reports')") or "{}")


def jarjestys(pg):
    return pg.eval_on_selector_all("[data-w-grid=reports]>.fv-w", "e => e.map(x => x.dataset.fw)")


def kuusi_lajia():
    t = talli()
    t[2]["events"] += [M("z2", "Katsastus", "2026-06-01", 60000, cost="55"), M("z3", "Renkaiden vaihto", "2026-06-02", 60000, cost="70")]
    return t


JAKAUMA_JS = """() => {const L = [...document.querySelectorAll('.rp-dist .rp-drow')], nro = t => Number((t || '').replace(/[^0-9]/g, ''));
  return {lajit: L.map(b => b.dataset.rpKind), euro: L.map(b => nro(b.querySelector('b').textContent)),
    pros: L.reduce((m, b) => m + nro(b.querySelector('em').textContent), 0),
    yli: [...document.querySelectorAll('.rp-dt > *, .fv-card .fv-val, .fv-card .fv-lab2, .fv-card .fv-per')].filter(e => {const r = e.getBoundingClientRect(),
      p = e.closest('.rp-card, .fv-card').getBoundingClientRect(); return r.right > p.right + 0.5 || (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis');}).map(e => e.textContent),
    sivu: document.querySelector('#app-screen').scrollWidth - document.querySelector('#app-screen').clientWidth};}"""


def test_rakenne_ja_summat(browser, base):
    s = avaa(browser, base, "reports", autot=talli(), extra=VUOSI, kello=KELLO)
    pg = s.page
    try:
        assert pg.locator("[data-rp-tab], .rp-tabs, .rp-filters, .rp-total").count() == 0, "vanha yläosa jäi"
        r = pg.evaluate("""() => {const b = [...document.querySelector('.fv-bar').children].map(e => e.getBoundingClientRect());
          return {n: b.length, rivi: new Set(b.map(x => Math.round(x.top))).size, korkeus: new Set(b.map(x => Math.round(x.height))).size,
                  lisaa: document.querySelectorAll('.fv-bar [data-rp-add], .fv-bar .fv-add').length, aria: document.querySelector('.tab-dock > .tab-fab[data-fab-menu]')?.getAttribute('aria-label')};}""")
        # 0.107: ylärivissä ajoneuvo ja jakso; Lisää merkintä on kelluva ＋ alavalikon yläpuolella.
        assert r["n"] == 2 and r["rivi"] == 1 and r["korkeus"] == 1 and r["lisaa"] == 0 and r["aria"] == "Lisää merkintä", r
        assert jarjestys(pg) == OLETUS
        assert [kortti(pg, k) for k in ("tot", "fuel", "svc")] == [YHT, POLTTO, HUOLLOT + KORJAUKSET]
        # Keskimäärin / kk: 1 265 € / (9 + 29/31 kk) = 127 €; jakaja näkyy.
        assert kortti(pg, "mon") == round(YHT / (9 + 29 / 31)), pg.inner_text("[data-fw=mon]")
        assert "9,9 kk:n ajalta" in pg.inner_text("[data-fw=mon] .rp-basis")
        assert all(jakso(pg, k) == "Tämä vuosi" for k in ("tot", "mon", "fuel", "svc"))
        j = pg.evaluate(JAKAUMA_JS)
        assert j["lajit"] == ["fuel", "service", "repair", "other"] and j["euro"] == [POLTTO, HUOLLOT, KORJAUKSET, MUUT], j
        assert sum(j["euro"]) == kortti(pg, "tot") and j["pros"] == 100, j
        # Kuukausipylväät yhteensä = kokonaiskulut; lokakuu kesken; valitun kuukauden erittely.
        cols = pg.eval_on_selector_all(".rp-col", "e => e.map(b => [Number(b.dataset.rpT), b.classList.contains('part')])")
        assert len(cols) == 10 and sum(c[0] for c in cols) == YHT and [c[1] for c in cols].index(True) == 9, cols
        pg.click('.rp-col[data-rp-m="2"]'); pg.wait_for_timeout(150)
        t = pg.inner_text(".rp-msel")
        assert "Maaliskuu 2026" in t and "Kulut yhteensä" in t and "496 €" in t.replace(" ", " "), t
        pg.click('.rp-col[data-rp-m="9"]'); pg.wait_for_timeout(150)
        assert "keskeneräinen kuukausi" in pg.inner_text(".rp-msel")
        # Ajoneuvorivien summa = kokonaiskulut; vienti molemmilla painikkeilla.
        assert sum(nro(x) for x in pg.eval_on_selector_all(".rp-vlist .rp-vtop b", "e => e.map(b => b.textContent)")) == YHT
        assert pg.locator(".rp-export [data-rp-pdf]:not([disabled])").count() == 1 and pg.locator(".rp-export [data-rp-csv]:not([disabled])").count() == 1
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("kieli", ["fi", "en", "sv"])
@pytest.mark.parametrize("leveys", [320, 390, 430])
def test_mobiiliasettelu(browser, base, kieli, leveys):
    autot = kuusi_lajia()
    autot[1]["name"] = "Mercedes-Benz Sprinter 319 CDI Pitkä"
    s = avaa(browser, base, "reports", autot=autot, kieli=kieli, leveys=leveys, extra=VUOSI, kello=KELLO)
    pg = s.page
    try:
        j = pg.evaluate(JAKAUMA_JS)
        # Katsastus ja renkaat kuuluvat luokkaan Muut: neljä luokkaa, summat = kokonaiskulut.
        assert len(j["lajit"]) == 4 and j["euro"][3] == MUUT + 55 + 70 and sum(j["euro"]) == kortti(pg, "tot"), j
        assert j["pros"] == 100 and not j["yli"] and j["sivu"] <= 0, j
        r = pg.evaluate("""() => {const g = document.querySelector('[data-w-grid=reports]').getBoundingClientRect(), k = e => e.getBoundingClientRect();
          return {kpi: [...document.querySelectorAll('.fv-card')].map(e => Math.round(k(e).width)), leveat: ['months', 'dist', 'cars', 'exp'].map(w => Math.round(k(document.querySelector(`[data-fw=${w}]`)).width)), g: Math.round(g.width)};}""")
        assert len(set(r["kpi"])) == 1 and r["kpi"][0] < r["g"] / 2 and all(abs(w - r["g"]) <= 1 for w in r["leveat"]), r
        pg.click(".rp-veh>summary")
        m = pg.evaluate("""() => {const sc = document.querySelector('.screen-content').getBoundingClientRect(), l = document.querySelector('.rp-veh .fl-cmenu-list').getBoundingClientRect();
          return {sisalla: l.left >= sc.left - 0.5 && l.right <= sc.right + 0.5, rivit: [...document.querySelectorAll('.rp-veh [data-rp-car]')].map(b => b.getBoundingClientRect().height)};}""")
        assert m["sisalla"] and len(m["rivit"]) == 4 and min(m["rivit"]) >= 44, m
        # Viimeinen osio ei jää alavalikon alle.
        pg.evaluate("document.getElementById('app-screen').scrollTop = 1e6"); pg.wait_for_timeout(100)
        assert pg.evaluate("document.querySelector('[data-fw=exp]').getBoundingClientRect().bottom <= document.querySelector('.tab-dock').getBoundingClientRect().top + 1")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_ajoneuvon_valinta(browser, base):
    s = avaa(browser, base, "reports", autot=talli(), extra=VUOSI, kello=KELLO)
    pg = s.page
    try:
        assert "Kaikki" in pg.inner_text(".rp-veh>summary") and pg.locator(".rp-veh>summary .fv-vall").count() == 1
        pg.click(".rp-veh>summary")
        assert pg.eval_on_selector_all(".rp-veh [data-rp-car]", "e => e.map(b => b.dataset.rpCar)") == ["", "a1", "a2", "a3"]
        pg.click('.rp-veh [data-rp-car="a1"]'); pg.wait_for_timeout(150)
        assert pg.evaluate("document.querySelector('.rp-veh').open") is False
        assert "TST-201" in pg.inner_text(".rp-veh>summary") and pg.locator(".rp-veh>summary .fv-vpic img").count() == 1
        # Vain Pakettiauton luvut: 496 + 285 + 110 + 124.
        assert kortti(pg, "tot") == 1015 and kortti(pg, "svc") == 781 and kortti(pg, "fuel") == 234
        assert pg.eval_on_selector_all(".rp-vlist strong", "e => e.map(x => x.textContent)") == ["Testi Pakettiauto"]
        assert "Huoltohistoriaraportti" in pg.inner_text("[data-fw=cars]") and "Tankkauskirja" in pg.inner_text("[data-fw=cars]")
        assert "Testi Pakettiauto" in pg.inner_text(".rp-export .rp-sub")
        assert prefs(pg)["car"] == "a1"
        pg.reload(); pg.wait_for_selector("[data-w-grid=reports]")
        assert kortti(pg, "tot") == 1015, "valinta ei säilynyt"
        # Takaisin kaikkiin vertailupainikkeesta; ajoneuvorivin napautus valitsee ajoneuvon.
        pg.click(".rp-toall"); pg.wait_for_timeout(150)
        assert kortti(pg, "tot") == YHT and pg.locator(".rp-vlist .rp-vcard").count() == 3
        pg.click('[data-rp-open="a2"]'); pg.wait_for_timeout(150)
        assert kortti(pg, "tot") == 190 and pg.evaluate("location.hash") == "#reports" and pg.evaluate("document.getElementById('app-screen').scrollTop") == 0
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_vanha_monivalinta_siirtyy(browser, base):
    """Versioon 0.101 asti ajoneuvot olivat monivalinta (offCars): yksi valittu siirtyy valinnaksi, useampi = kaikki."""
    s = avaa(browser, base, "reports", autot=talli(), kello=KELLO,
             extra={"ajoura-reports": '{"p":"year","t":"cars","offCars":["a1","a3"],"offKinds":["inspect","repair"]}'})
    pg = s.page
    try:
        assert kortti(pg, "tot") == 190 and "TST-202" in pg.inner_text(".rp-veh>summary")
        assert pg.get_attribute('[data-rp-kind="repair"]', "aria-pressed") == "false"
        pg.evaluate("localStorage.setItem('ajoura-reports', '{\"p\":\"year\",\"offCars\":[\"a1\"]}')")
        pg.reload(); pg.wait_for_selector("[data-w-grid=reports]")
        assert kortti(pg, "tot") == YHT
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_seitseman_jaksoa_ja_mukautettu(browser, base):
    autot = talli()
    autot[0]["events"].append(M("x9", "Huolto", "2025-06-01", 130000, cost="300"))
    s = avaa(browser, base, "reports", autot=autot, extra=VUOSI, kello=KELLO)
    pg = s.page
    try:
        assert pg.eval_on_selector_all("[data-rp-period] option", "e => e.map(o => o.value)") == \
            ["year", "prev", "12", "month", "pmonth", "custom", "all"]
        odotus = {"year": YHT, "prev": 300, "12": 496 + 285 + 190 + 234 + 60, "month": 124 + 60, "pmonth": 110, "all": YHT + 300}
        for v, n in odotus.items():
            pg.select_option("[data-rp-period]", v); pg.wait_for_timeout(120)
            assert kortti(pg, "tot") == n, (v, kortti(pg, "tot"))
        pg.select_option("[data-rp-period]", "pmonth"); pg.wait_for_timeout(120)
        assert "1.9.–30.9.2026" in pg.inner_text(".rp-export .rp-sub") and pg.locator(".rp-col").count() == 1
        # Mukautettu: päivät ylärivin alla, alku 12 kk:n alusta; loppu ennen alkua ei tallennu.
        pg.select_option("[data-rp-period]", "custom"); pg.wait_for_timeout(150)
        assert pg.locator(".fv-bar [data-rp-custom]").count() == 0 and pg.locator("[data-rp-custom]").count() == 1
        assert pg.input_value("[data-rp-custom] [name=cf]") == "2025-11-01"
        pg.fill("[data-rp-custom] [name=cf]", "2026-03-01"); pg.wait_for_timeout(150)
        pg.fill("[data-rp-custom] [name=ct]", "2026-05-31"); pg.wait_for_timeout(150)
        assert kortti(pg, "tot") == 496 + 285 + 190 and pg.locator(".rp-col").count() == 3
        assert jakso(pg, "tot") == "1.3.2026–31.5.2026"
        pg.fill("[data-rp-custom] [name=cf]", "2026-06-15"); pg.wait_for_timeout(150)
        assert "loppupäivän jälkeen" in pg.inner_text("[data-rp-custom] [role=alert]") and prefs(pg)["cf"] == "2026-03-01"
        assert pg.get_attribute("[data-rp-custom] [name=ct]", "min") == "2026-03-01"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def aseta(pg, k, v, cf=None, ct=None):
    pg.click(f"[data-rp-set={k}]"); pg.wait_for_selector(".fk-sheet")
    pg.check(f'.fk-sheet input[name=fkp][value="{v}"]')
    if cf:
        pg.fill(".fk-sheet [name=cf]", cf); pg.fill(".fk-sheet [name=ct]", ct)
    pg.click(".fk-sheet [type=submit]"); pg.wait_for_timeout(150)


def test_korttien_omat_jaksot(browser, base):
    autot = talli()
    autot[0]["events"].append(M("x9", "Huolto", "2025-06-01", 130000, cost="300"))
    s = avaa(browser, base, "reports", autot=autot, extra=VUOSI, kello=KELLO)
    pg = s.page
    try:
        assert pg.get_attribute("[data-rp-set=tot]", "aria-label") == "Kokonaiskulujen asetukset"
        aseta(pg, "tot", "year"); aseta(pg, "mon", "12"); aseta(pg, "fuel", "month"); aseta(pg, "svc", "all")
        assert [jakso(pg, k) for k in ("tot", "mon", "fuel", "svc")] == ["Tämä vuosi", "12 kk", "Kuluva kuukausi", "Koko historia"]
        assert kortti(pg, "fuel") == 124 and kortti(pg, "svc") == 285 + 190 + 496 + 300
        assert "12 kk:n ajalta" not in pg.inner_text("[data-fw=mon]")  # 12 kk = 11 kk + 29/31
        assert "11,9 kk:n ajalta" in pg.inner_text("[data-fw=mon]")
        # Sivun jakson vaihto ei muuta omia jaksoja; kaavio, jakauma ja vienti seuraavat sivua.
        pg.select_option("[data-rp-period]", "prev"); pg.wait_for_timeout(150)
        assert kortti(pg, "tot") == YHT and kortti(pg, "fuel") == 124
        assert sum(nro(x) for x in pg.eval_on_selector_all(".rp-dist .rp-drow b", "e => e.map(b => b.textContent)")) == 300
        assert "1.1.–31.12.2025" in pg.inner_text(".rp-export .rp-sub")
        # Peruuta ei muuta; Käytä sivun aikaväliä palauttaa seuraamaan sivua.
        pg.click("[data-rp-set=fuel]"); pg.check('.fk-sheet input[value="all"]'); pg.click(".fk-sheet .app-button.secondary")
        assert kortti(pg, "fuel") == 124
        aseta(pg, "tot", "page")
        assert kortti(pg, "tot") == 300 and jakso(pg, "tot") == "Edellinen vuosi"
        # Kortin oma mukautettu jakso; loppu ennen alkua ei tallennu.
        pg.click("[data-rp-set=svc]"); pg.check('.fk-sheet input[value="custom"]')
        pg.fill(".fk-sheet [name=cf]", "2026-05-01"); pg.fill(".fk-sheet [name=ct]", "2026-04-01"); pg.click(".fk-sheet [type=submit]")
        assert "Alkupäivä on loppupäivän jälkeen." in pg.inner_text(".fk-sheet [role=alert]")
        pg.fill(".fk-sheet [name=ct]", "2026-05-31"); pg.click(".fk-sheet [type=submit]"); pg.wait_for_timeout(150)
        assert kortti(pg, "svc") == 285 and jakso(pg, "svc") == "1.5.2026–31.5.2026"
        pg.reload(); pg.wait_for_selector("[data-w-grid=reports]")
        assert kortti(pg, "svc") == 285 and jakso(pg, "fuel") == "Kuluva kuukausi" and jakso(pg, "tot") == "Edellinen vuosi"
        # Toinen ajoneuvo: omat jaksot säilyvät, luvut sen ajoneuvon.
        pg.click(".rp-veh>summary"); pg.click('.rp-veh [data-rp-car="a2"]'); pg.wait_for_timeout(150)
        assert kortti(pg, "fuel") == 0 and kortti(pg, "svc") == 0 and kortti(pg, "mon") == round(190 / (11 + 29 / 31))  # Farmarilla vain huolto 1.4.
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_piilotus_ei_muuta_summia(browser, base):
    s = avaa(browser, base, "reports", autot=talli(), extra=VUOSI, kello=KELLO)
    pg = s.page
    pylvaat = lambda: pg.evaluate("[...document.querySelectorAll('.rp-col')].reduce((m, b) => m + Number(b.dataset.rpT), 0)")
    try:
        pg.click('[data-rp-kind="repair"]'); pg.wait_for_timeout(150)
        assert kortti(pg, "tot") == YHT and kortti(pg, "svc") == HUOLLOT + KORJAUKSET, "piilotus muutti tunnuslukua"
        assert pylvaat() == YHT - KORJAUKSET
        rivi = pg.inner_text('[data-rp-kind="repair"]').replace(" ", " ")
        assert "Piilotettu kaaviosta" in rivi and "496 €" in rivi and pg.get_attribute('[data-rp-kind="repair"]', "aria-pressed") == "false"
        assert pg.evaluate("document.activeElement?.dataset.rpKind") == "repair"
        for k in ("fuel", "service", "other"):
            pg.click(f'[data-rp-kind="{k}"]'); pg.wait_for_timeout(100)
        assert "Kaikki kululajit on piilotettu kaaviosta." in pg.inner_text("[data-fw=months]")
        assert kortti(pg, "tot") == YHT and pg.locator(".rp-vlist .rp-vcard").count() == 3
        pg.click('[data-rp-kind="service"]'); pg.wait_for_timeout(150)
        assert pylvaat() == HUOLLOT
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_lajittelu_ja_eur_km(browser, base):
    autot = talli() + [tiedot.auto("a4", name="Testi Tyhjä", plate="TST-204", km=50000)]
    s = avaa(browser, base, "reports", autot=autot, extra=VUOSI, kello=KELLO)
    pg = s.page
    nimet = lambda: pg.eval_on_selector_all(".rp-vlist strong", "e => e.map(x => x.textContent)")
    try:
        assert pg.eval_on_selector_all("[data-rp-sort] option", "e => e.map(o => o.value)") == ["cost", "costa", "name", "km"]
        assert nimet() == ["Testi Pakettiauto", "Testi Farmari", "Testi Asuntoauto", "Testi Tyhjä"]
        pg.select_option("[data-rp-sort]", "costa"); pg.wait_for_timeout(150)
        assert nimet() == ["Testi Tyhjä", "Testi Asuntoauto", "Testi Farmari", "Testi Pakettiauto"]
        pg.select_option("[data-rp-sort]", "name"); pg.wait_for_timeout(150)
        assert nimet() == ["Testi Asuntoauto", "Testi Farmari", "Testi Pakettiauto", "Testi Tyhjä"]
        tyhja = pg.locator(".rp-vcard", has_text="Testi Tyhjä").inner_text()
        assert "–" in tyhja and "Ei kirjattuja kuluja valitulla ajanjaksolla." in tyhja and "0 €" not in tyhja.replace(" ", " ")
        assert all("€/km" in t for t in pg.eval_on_selector_all(".rp-vcard", "e => e.map(x => x.innerText)") if "Tyhjä" not in t)
        assert pg.locator(".rp-vcard .rp-delta").count() == 0
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_vienti_noudattaa_valintaa(browser, base, tmp_path):
    s = avaa(browser, base, "reports", autot=talli(), mobiili=False, extra={"ajoura-reports": '{"p":"year","car":"a1"}'}, kello=KELLO)
    pg = s.page
    try:
        assert pg.inner_text(".rp-export [data-rp-csv] small").replace(" ", " ").startswith("4 ")
        with pg.expect_download() as d:
            pg.click("[data-rp-csv]")
        rivit = open(d.value.path(), encoding="utf-8-sig").read().splitlines()
        otsake = rivit[0].split(";")
        i, a, k = otsake.index("Summa (€)"), otsake.index("Ajoneuvo"), otsake.index("Kululaji")
        data = [r.split(";") for r in rivit[1:]]
        assert len(data) == 4 and {r[a] for r in data} == {"Testi Pakettiauto"}
        assert round(sum(float(r[i].replace(",", ".") or 0) for r in data)) == kortti(pg, "tot") == 1015
        assert {r[k] for r in data} <= {"Polttoaine ja lataus", "Huollot", "Korjaukset", "Muut"}, {r[k] for r in data}
        if shutil.which("pdftotext"):
            with pg.expect_download() as d:
                pg.click("[data-rp-pdf]")
            pdf = tmp_path / "k.pdf"; d.value.save_as(pdf)
            t = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True).stdout.replace(" ", " ")
            assert "Testi Pakettiauto" in t and "1 015 €" in t and "Testi Farmari" not in t, t[:600]
        # Kortin oma jakso ei vaikuta vientiin.
        aseta(pg, "tot", "all")
        assert pg.inner_text(".rp-export [data-rp-csv] small").replace(" ", " ").startswith("4 ")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_ei_kuluja(browser, base):
    autot = [tiedot.auto("a4", name="Testi Tyhjä", plate="TST-204", km=50000)]
    s = avaa(browser, base, "reports", autot=autot, extra=VUOSI, kello=KELLO)
    pg = s.page
    try:
        assert [kortti(pg, k) for k in ("tot", "mon", "fuel", "svc")] == [0, 0, 0, 0]
        assert "Ei kirjattuja kuluja valitulla ajanjaksolla." in pg.inner_text("[data-fw=months]")
        assert pg.locator("[data-rp-pdf][disabled]").count() == 1 and pg.locator("[data-rp-csv][disabled]").count() == 1
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_lisaa_merkinta(browser, base):
    """0.107: kelluvan ＋:n valikko: Lisää huolto ja Lisää muistiinpano. Kaikki ajoneuvot: ajoneuvo valitaan ensin;
    yksi ajoneuvo valittuna: lomake aukeaa suoraan sille."""
    s = avaa(browser, base, "reports", autot=talli(), extra=VUOSI, kello=KELLO)
    pg = s.page
    try:
        pg.click("[data-fab-menu]"); pg.wait_for_selector("#fab-menu:not([hidden])")
        pg.click("[data-fab-act=svc]"); pg.wait_for_selector(".rp-addsheet")
        assert pg.eval_on_selector_all(".rp-addsheet [data-rp-pickcar]", "e => e.map(i => i.dataset.rpPickcar)") == ["a1", "a2", "a3"]
        assert "Lisää huolto" in pg.inner_text(".rp-addsheet") and pg.locator("#fab-menu:not([hidden])").count() == 0
        pg.click('[data-rp-pickcar="a2"]')
        pg.wait_for_function("location.hash === '#add/a2'"); pg.wait_for_selector("#event-form")
        assert pg.locator("#event-form").count() == 1 and pg.locator(".sheet-layer").count() == 0
        # Valittu ajoneuvo: ei ajoneuvokysymystä, muistiinpano avaa ajoneuvon muistiinpanot.
        pg.evaluate("localStorage.setItem('ajoura-reports', '{\"p\":\"year\",\"car\":\"a1\"}')")
        pg.goto(base + "/app.html#reports"); pg.wait_for_selector("[data-w-grid=reports]")
        pg.click("[data-fab-menu]"); pg.click("[data-fab-act=memo]")
        pg.wait_for_function("location.hash === '#notes/a1'")
        assert pg.locator(".sheet-layer").count() == 0
        pg.goto(base + "/app.html#reports"); pg.wait_for_selector("[data-w-grid=reports]")
        pg.click("[data-fab-menu]"); pg.click("[data-fab-act=svc]")
        pg.wait_for_function("location.hash === '#add/a1'"); pg.wait_for_selector("#event-form")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def keski(pg, k):
    b = pg.locator(f"[data-fw={k}]").bounding_box()
    return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2


def test_widgettien_jarjestys(browser, base):
    s = avaa(browser, base, "reports", autot=talli(), extra=VUOSI, korkeus=2600, mobiili=False, kello=KELLO)
    pg = s.page
    try:
        x, y = keski(pg, "tot"); x2, _ = keski(pg, "mon")
        pg.mouse.move(x, y); pg.mouse.down(); pg.wait_for_timeout(650)
        assert pg.locator(".fv-w.dragging").count() == 1
        for i in range(1, 11):
            pg.mouse.move(x + (x2 + 30 - x) * i / 10, y); pg.wait_for_timeout(20)
        pg.mouse.up(); pg.wait_for_timeout(300)
        assert jarjestys(pg)[:2] == ["mon", "tot"]
        # Vienti ylimmäksi.
        x, y = keski(pg, "exp"); _, y0 = keski(pg, "mon")
        pg.mouse.move(x, y); pg.mouse.down(); pg.wait_for_timeout(650)
        for i in range(1, 16):
            pg.mouse.move(x, y + (y0 - 40 - y) * i / 15); pg.wait_for_timeout(20)
        pg.mouse.up(); pg.wait_for_timeout(300)
        uusi = jarjestys(pg)
        assert uusi[0] == "exp" and prefs(pg)["w"] == uusi, uusi
        assert pg.locator(".sheet-layer").count() == 0 and pg.evaluate("location.hash") == "#reports"
        # Pitkä painallus kuvakkeesta ei avaa asetuksia.
        b = pg.locator("[data-rp-set=fuel]").bounding_box()
        pg.mouse.move(b["x"] + 10, b["y"] + 10); pg.mouse.down(); pg.wait_for_timeout(650); pg.mouse.up(); pg.wait_for_timeout(500)
        assert pg.locator(".sheet-layer").count() == 0
        # Kuukausipylvään napautus toimii edelleen.
        pg.click('.rp-col[data-rp-m="2"]'); pg.wait_for_timeout(150)
        assert "Maaliskuu 2026" in pg.inner_text(".rp-msel")
        pg.reload(); pg.wait_for_selector("[data-w-grid=reports]")
        assert jarjestys(pg) == uusi
        # Tankkaus-välilehden järjestys on erillinen.
        assert "w" not in json.loads(pg.evaluate("localStorage.getItem('ajoura-fuel')") or "{}")
        aseta(pg, "fuel", "month")
        pg.click("[data-rp-set=tot]"); pg.click(".fk-sheet [data-fl-reset-w]"); pg.wait_for_timeout(150)
        assert jarjestys(pg) == OLETUS and "Widgettien järjestys palautettu" in pg.inner_text(".success-note")
        assert jakso(pg, "fuel") == "Kuluva kuukausi"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_kosketus_vierittaa_ja_siirtaa(browser, base):
    s = avaa(browser, base, "reports", autot=talli(), extra=VUOSI, korkeus=700, kello=KELLO)
    pg = s.page
    try:
        cdp = pg.context.new_cdp_session(pg)
        kos = lambda t, x, y: cdp.send("Input.dispatchTouchEvent", {"type": t, "touchPoints": [] if t == "touchEnd" else [{"x": x, "y": y, "id": 1}]})
        x, y = keski(pg, "fuel")
        kos("touchStart", x, y)
        for i in range(1, 9):
            kos("touchMove", x, y - 25 * i); pg.wait_for_timeout(16)
        kos("touchEnd", 0, 0); pg.wait_for_timeout(500)
        assert pg.evaluate("document.getElementById('app-screen').scrollTop") > 50 and jarjestys(pg) == OLETUS
        pg.evaluate("document.getElementById('app-screen').scrollTop = 0"); pg.wait_for_timeout(100)
        x, y = keski(pg, "tot")
        kos("touchStart", x, y); pg.wait_for_timeout(650)
        assert pg.locator(".fv-w.dragging").count() == 1
        for i in range(1, 11):
            kos("touchMove", x, y + (690 - y) * i / 10); pg.wait_for_timeout(20)
        pg.wait_for_timeout(2000)
        kos("touchEnd", 0, 0); pg.wait_for_timeout(300)
        assert jarjestys(pg).index("tot") > 3 and prefs(pg)["w"] == jarjestys(pg)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("teema", [None, "dark"])
def test_varit_yhtenaiset(browser, base, teema):
    s = avaa(browser, base, "reports", autot=talli(), teema=teema, extra=VUOSI, kello=KELLO)
    pg = s.page
    try:
        for k in ("fuel", "service", "repair", "other"):
            v = pg.evaluate(f"""() => [...new Set([...document.querySelectorAll('.rp-stk .rpk-{k}, .rp-dbar .rpk-{k}, .rp-vlist .rpk-{k}, .rp-legend .rpk-{k}')]
                .map(e => getComputedStyle(e).backgroundColor + getComputedStyle(e).filter))]""")
            assert len(v) == 1, (k, v)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("kieli,otsikko,lisaa", [("en", "Total cost settings", "Choose vehicle"),
                                                 ("sv", "Inställningar för totala kostnader", "Välj fordon")])
def test_kaannokset(browser, base, kieli, otsikko, lisaa):
    s = avaa(browser, base, "reports", autot=talli(), kieli=kieli, extra=VUOSI, kello=KELLO)
    pg = s.page
    try:
        pg.click("[data-rp-set=tot]"); pg.wait_for_selector(".fk-sheet"); pg.wait_for_timeout(200)
        assert otsikko in pg.inner_text(".fk-sheet")
        pg.keyboard.press("Escape"); pg.click("[data-fab-menu]"); pg.click("[data-fab-act=svc]"); pg.wait_for_selector(".rp-addsheet"); pg.wait_for_timeout(200)
        t = pg.inner_text(".rp-addsheet")
        assert lisaa in t and "Valitse ajoneuvo" not in t and "Lisää huolto" not in t, t
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
