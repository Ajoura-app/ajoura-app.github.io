"""0.99 (Niklas): Tankkaus ja lataus -välilehti.

1. Jaksoja on seitsemän tässä järjestyksessä: Tämä vuosi, Edellinen vuosi, 12 kk, Kuluva kuukausi, Edellinen kuukausi,
   Mukautettu, Kaikki. Mukautettu avaa alku- ja loppupäivän, eikä loppu voi olla ennen alkua.
2. Jokaisella neljällä tunnuslukukortilla voi olla oma jakso (kuvake avaa asetusikkunan). Muut kortit, kaavio ja lista
   seuraavat sivun jaksoa.
3. Widgettien järjestys vaihtuu pitkällä painalluksella ja vetämällä kuten etusivun ajoneuvokorteissa (0.92), ja
   oletusjärjestyksen voi palauttaa. Asetukset säilyvät uudelleenlatauksen yli, tankkauksiin ei kosketa.
"""
import json

import pytest

import tiedot
from apu import KELLO, avaa

T = tiedot.tankkaus
OLETUS = ["avg", "price", "cost", "n", "trend", "list", "pdf"]


def talli():
    # KELLO = 29.10.2026. Tankkauksia: 2025: 2 kpl, 2026: 5 kpl, syyskuu 2026: 2, lokakuu 2026: 2.
    f = [T("a1", "2025-06-10", 100000, 40.0, 70.0), T("a2", "2025-12-15", 100800, 45.0, 80.0),
         T("a3", "2026-01-10", 101500, 42.0, 75.0), T("a4", "2026-09-05", 105000, 40.0, 72.0),
         T("a5", "2026-09-20", 105600, 38.0, 68.0), T("a6", "2026-10-05", 106200, 41.0, 74.0),
         T("a7", "2026-10-25", 106800, 39.0, 71.0)]
    ev = tiedot.auto(id="ev1", name="Kia Niro EV", plate="TST-202", fuel="Sähkö", body="suv", km=48200,
                     fuels=[T("e1", "2026-09-01", 47800, 40.0, 10.0), T("e2", "2026-09-20", 48200, 45.0, 11.5),
                            T("e3", "2026-10-10", 48700, 50.0, 12.0)])
    return [tiedot.auto(km=106800, fuels=f), ev]


def luku(pg, k):
    return pg.inner_text(f"[data-fw={k}] .fv-val").replace(" ", " ").replace(" ", " ").strip()


def jakso(pg, k):
    return pg.inner_text(f"[data-fw={k}] .fv-per").strip()


def tallennettu(s):
    return json.loads(s.page.evaluate("localStorage.getItem('ajoura-fuel')") or "{}")


def jarjestys(pg):
    return pg.eval_on_selector_all("[data-fl-grid]>.fv-w", "e => e.map(x => x.dataset.fw)")


def valitse_jakso(pg, v):
    pg.select_option("[data-fl-period]", v)
    pg.wait_for_function(f"document.querySelector('[data-fl-period]').value === '{v}'")


def test_seitseman_jaksoa(browser, base):
    s = avaa(browser, base, "fuel/tst1", autot=talli(), kello=KELLO)
    pg = s.page
    try:
        assert pg.eval_on_selector_all("[data-fl-period] option", "e => e.map(o => o.value)") == \
            ["year", "prev", "12", "month", "pmonth", "custom", "all"]
        assert pg.input_value("[data-fl-period]") == "12", "uuden käyttäjän oletus on 12 kk"
        # Tankkausten määrä kortissa jokaisella jaksolla (12 kk = 1.11.2025–29.10.2026).
        odotus = {"year": 5, "prev": 2, "12": 6, "month": 2, "pmonth": 2, "all": 7}
        for v, n in odotus.items():
            valitse_jakso(pg, v)
            assert luku(pg, "n").startswith(f"{n} /"), (v, luku(pg, "n"))
        valitse_jakso(pg, "pmonth")
        assert luku(pg, "cost") == "140 €" and jakso(pg, "cost") == "Edellinen kuukausi"  # 72 + 68
        assert "Edellinen kuukausi" in pg.inner_text(".rp-pdf"), "PDF-kortti noudattaa sivun jaksoa"
        pg.reload(); pg.wait_for_selector("[data-fl-grid]")
        assert pg.input_value("[data-fl-period]") == "pmonth", "jakso ei säilynyt"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_mukautettu_jakso(browser, base):
    s = avaa(browser, base, "fuel/tst1", autot=talli(), kello=KELLO)
    pg = s.page
    try:
        valitse_jakso(pg, "custom")
        # Alkaa valmiiksi 12 kk:n päivistä, joten kentät eivät ole tyhjiä.
        assert pg.input_value("[data-fl-custom] [name=cf]") == "2025-11-01"
        assert pg.input_value("[data-fl-custom] [name=ct]") == "2026-10-29"
        pg.fill("[data-fl-custom] [name=cf]", "2025-12-01"); pg.wait_for_timeout(200)
        pg.fill("[data-fl-custom] [name=ct]", "2026-01-31"); pg.wait_for_timeout(200)
        assert luku(pg, "n").startswith("2 /"), luku(pg, "n")
        assert jakso(pg, "n") == "1.12.2025–31.1.2026"
        assert pg.get_attribute("[data-fl-custom] [name=ct]", "min") == "2025-12-01"
        # Loppu ennen alkua: virheilmoitus, eikä väärää väliä tallenneta.
        pg.fill("[data-fl-custom] [name=ct]", "2025-11-15"); pg.wait_for_timeout(200)
        assert "Alkupäivä on loppupäivän jälkeen." in pg.inner_text("[data-fl-custom] [role=alert]")
        o = tallennettu(s)
        assert (o["p"], o["cf"], o["ct"]) == ("custom", "2025-12-01", "2026-01-31"), o
        pg.reload(); pg.wait_for_selector("[data-fl-grid]")
        assert pg.input_value("[data-fl-custom] [name=cf]") == "2025-12-01" and luku(pg, "n").startswith("2 /")
        # Muokattavissa myöhemmin.
        pg.fill("[data-fl-custom] [name=cf]", "2025-06-01"); pg.wait_for_timeout(200)
        assert luku(pg, "n").startswith("3 /"), luku(pg, "n")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def aseta_kortti(pg, k, v, cf=None, ct=None):
    pg.click(f"[data-fl-set={k}]")
    pg.wait_for_selector(".fk-sheet")
    pg.check(f".fk-sheet input[name=fkp][value=\"{v}\"]")
    if cf:
        pg.fill(".fk-sheet [name=cf]", cf); pg.fill(".fk-sheet [name=ct]", ct)
    pg.click(".fk-sheet [type=submit]")


def test_korttien_omat_jaksot(browser, base):
    s = avaa(browser, base, "fuel/tst1", autot=talli(), kello=KELLO)
    pg = s.page
    try:
        assert pg.get_attribute("[data-fl-set=avg]", "aria-label") == "Keskikulutuksen asetukset"
        # Esimerkkitilanne: jokaisella kortilla oma jakso.
        aseta_kortti(pg, "avg", "12")
        aseta_kortti(pg, "price", "pmonth")
        aseta_kortti(pg, "cost", "year")
        aseta_kortti(pg, "n", "month")
        assert pg.locator(".sheet-layer").count() == 0
        assert [jakso(pg, k) for k in ("avg", "price", "cost", "n")] == \
            ["12 kk", "Edellinen kuukausi", "Tämä vuosi", "Kuluva kuukausi"]
        assert luku(pg, "n").startswith("2 /") and luku(pg, "cost") == "360 €"  # 75 + 72 + 68 + 74 + 71
        assert luku(pg, "price").startswith("1,795"), luku(pg, "price")  # (72 + 68) / 78 l
        # Sivun jakson vaihto ei muuta omia jaksoja; kaavio ja lista seuraavat sivua.
        valitse_jakso(pg, "all")
        assert [jakso(pg, k) for k in ("avg", "price", "cost", "n")] == \
            ["12 kk", "Edellinen kuukausi", "Tämä vuosi", "Kuluva kuukausi"]
        assert luku(pg, "n").startswith("2 /")
        assert pg.locator("[data-fw=list] [data-fl-edit]").count() == 7 or "Näytä vanhemmat" in pg.inner_text("[data-fw=list]")
        # Peruuta ei muuta mitään.
        pg.click("[data-fl-set=n]"); pg.check(".fk-sheet input[value=all]"); pg.click(".fk-sheet .app-button.secondary")
        assert luku(pg, "n").startswith("2 /")
        # Takaisin sivun jaksoon: kortti seuraa sivua.
        aseta_kortti(pg, "n", "page")
        assert luku(pg, "n").startswith("7 /") and jakso(pg, "n") == "Koko historia"
        pg.reload(); pg.wait_for_selector("[data-fl-grid]")
        assert jakso(pg, "price") == "Edellinen kuukausi" and jakso(pg, "n") == "Koko historia"
        # Oma mukautettu jakso kortille; loppu ennen alkua ei tallennu.
        pg.click("[data-fl-set=cost]"); pg.check(".fk-sheet input[value=custom]")
        pg.fill(".fk-sheet [name=cf]", "2026-09-10"); pg.fill(".fk-sheet [name=ct]", "2026-09-01")
        pg.click(".fk-sheet [type=submit]")
        assert "Alkupäivä on loppupäivän jälkeen." in pg.inner_text(".fk-sheet [role=alert]")
        pg.fill(".fk-sheet [name=ct]", "2026-10-06"); pg.click(".fk-sheet [type=submit]")
        assert luku(pg, "cost") == "142 €" and jakso(pg, "cost") == "10.9.2026–6.10.2026"  # 68 + 74
        assert tallennettu(s)["kp"]["cost"] == {"p": "custom", "cf": "2026-09-10", "ct": "2026-10-06"}
        # Ajoneuvon vaihto: asetukset ja järjestys pysyvät, sähköautolla kWh-yksiköt.
        pg.goto(base + "/app.html#fuel/ev1"); pg.wait_for_selector("[data-fl-grid]")
        assert "kWh/100 km" in luku(pg, "avg") and "€/kWh" in luku(pg, "price"), (luku(pg, "avg"), luku(pg, "price"))
        assert jakso(pg, "avg") == "12 kk" and luku(pg, "n").startswith("3 /")
        assert "Lataukset" in pg.inner_text("[data-fw=n]")
        assert [x["qty"] for x in s.talli()["cars"][0]["fuels"]] == [40.0, 45.0, 42.0, 40.0, 38.0, 41.0, 39.0]
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_epaluotettava_kulutus_ei_numerona(browser, base):
    """Kortin oma jakso, jolla ei ole täyttä väliä: kulutusta ei näytetä numerona."""
    s = avaa(browser, base, "fuel/tst1", autot=talli(), kello=KELLO)
    pg = s.page
    try:
        aseta_kortti(pg, "avg", "custom", "2026-10-26", "2026-10-29")
        assert "Ei riittävästi tietoa" in luku(pg, "avg"), luku(pg, "avg")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def keski(pg, k):
    b = pg.locator(f"[data-fw={k}]").bounding_box()
    return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2


def test_jarjestys_hiirella_ja_palautus(browser, base):
    s = avaa(browser, base, "fuel/tst1", autot=talli(), korkeus=2400, mobiili=False, kello=KELLO)
    pg = s.page
    try:
        assert jarjestys(pg) == OLETUS
        # Keskikulutus Keskihinnan paikalle (sama rivi, oikealle).
        x, y = keski(pg, "avg"); x2, _ = keski(pg, "price")
        pg.mouse.move(x, y); pg.mouse.down(); pg.wait_for_timeout(650)
        assert pg.locator(".fv-w.dragging").count() == 1, "widget ei noussut pitkällä painalluksella"
        for i in range(1, 11):
            pg.mouse.move(x + (x2 + 30 - x) * i / 10, y); pg.wait_for_timeout(20)
        pg.mouse.up(); pg.wait_for_timeout(300)
        assert jarjestys(pg) == ["price", "avg", "cost", "n", "trend", "list", "pdf"]
        assert pg.locator(".sheet-layer").count() == 0
        # Kaavio ylimmäksi.
        x, y = keski(pg, "trend"); _, y0 = keski(pg, "price")
        pg.mouse.move(x, y); pg.mouse.down(); pg.wait_for_timeout(650)
        for i in range(1, 13):
            pg.mouse.move(x, y + (y0 - 40 - y) * i / 12); pg.wait_for_timeout(20)
        pg.mouse.up(); pg.wait_for_timeout(300)
        assert jarjestys(pg)[0] == "trend", jarjestys(pg)
        uusi = jarjestys(pg)
        assert tallennettu(s)["w"] == uusi
        # Pitkä painallus kuvakkeesta ei avaa asetuksia; lyhyt avaa.
        x, y = keski(pg, "cost")
        b = pg.locator("[data-fl-set=cost]").bounding_box()
        pg.mouse.move(b["x"] + 10, b["y"] + 10); pg.mouse.down(); pg.wait_for_timeout(650); pg.mouse.up(); pg.wait_for_timeout(300)
        assert pg.locator(".sheet-layer").count() == 0, "pitkä painallus avasi asetukset"
        assert jarjestys(pg) == uusi
        pg.wait_for_timeout(300)  # vapautuksen jälkeinen napautuksen esto (0,4 s) on ohi
        pg.click("[data-fl-set=cost]"); pg.wait_for_selector(".fk-sheet")
        assert pg.locator(".fv-w.dragging").count() == 0
        pg.keyboard.press("Escape")
        # Säilyy uudelleenlatauksen ja ajoneuvon vaihdon yli.
        pg.reload(); pg.wait_for_selector("[data-fl-grid]")
        assert jarjestys(pg) == uusi
        pg.goto(base + "/app.html#fuel/ev1"); pg.wait_for_selector("[data-fl-grid]")
        assert jarjestys(pg) == uusi
        # Palautus: vain järjestys, ei korttien jaksoja eikä tankkauksia.
        aseta_kortti(pg, "n", "month")
        pg.click("[data-fl-set=avg]"); pg.click(".fk-sheet [data-fl-reset-w]")
        assert jarjestys(pg) == OLETUS
        assert "Widgettien järjestys palautettu" in pg.inner_text(".success-note")
        assert jakso(pg, "n") == "Kuluva kuukausi"
        assert len(s.talli()["cars"][0]["fuels"]) == 7
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def kosketus(pg):
    cdp = pg.context.new_cdp_session(pg)
    return lambda tyyppi, x, y: cdp.send("Input.dispatchTouchEvent", {
        "type": tyyppi, "touchPoints": [] if tyyppi == "touchEnd" else [{"x": x, "y": y, "id": 1}]})


def test_jarjestys_kosketuksella_ja_vieritys(browser, base):
    """Puhelin: pyyhkäisy vierittää eikä siirrä; pitkä painallus ja veto siirtää, ja reunalla näkymä vierittää mukana."""
    s = avaa(browser, base, "fuel/tst1", autot=talli(), korkeus=700, kello=KELLO)
    pg = s.page
    try:
        kosketa = kosketus(pg)
        # Tavallinen pyyhkäisy ylöspäin vierittää sivua.
        x, y = keski(pg, "cost")
        kosketa("touchStart", x, y)
        for i in range(1, 9):
            kosketa("touchMove", x, y - 25 * i); pg.wait_for_timeout(16)
        kosketa("touchEnd", 0, 0); pg.wait_for_timeout(500)
        assert pg.evaluate("document.getElementById('app-screen').scrollTop") > 50, "pyyhkäisy ei vierittänyt"
        assert pg.locator(".fv-w.dragging").count() == 0 and jarjestys(pg) == OLETUS
        pg.evaluate("document.getElementById('app-screen').scrollTop = 0"); pg.wait_for_timeout(100)
        # Keskikulutus pitkällä painalluksella alas näytön reunaan: näkymä vierittää, ja kortti päätyy viimeiseksi.
        x, y = keski(pg, "avg")
        kosketa("touchStart", x, y); pg.wait_for_timeout(650)
        assert pg.locator(".fv-w.dragging").count() == 1
        for i in range(1, 11):
            kosketa("touchMove", x, y + (690 - y) * i / 10); pg.wait_for_timeout(20)
        pg.wait_for_function("document.getElementById('app-screen').scrollTop > 0")
        pg.wait_for_timeout(2500)
        kosketa("touchEnd", 0, 0); pg.wait_for_timeout(300)
        o = jarjestys(pg)
        assert o[-1] == "avg" or o.index("avg") > 3, o
        assert tallennettu(s)["w"] == o
        assert pg.locator(".sheet-layer").count() == 0
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_vanha_asetus_ja_virheellinen(browser, base):
    """0.98:n tallentama valinta toimii, ja tuntematon tai rikkinäinen asetus palaa oletukseen."""
    vanha = '{"p":"prev","t":"car","car":"tst1"}'
    s = avaa(browser, base, "fuel/tst1", autot=talli(), kello=KELLO, extra={"ajoura-fuel": vanha})
    pg = s.page
    try:
        assert pg.input_value("[data-fl-period]") == "prev" and jarjestys(pg) == OLETUS
        assert luku(pg, "n").startswith("2 /")
        pg.evaluate("""localStorage.setItem('ajoura-fuel', JSON.stringify({p:'custom', cf:'2026-05-01', ct:'2026-01-01',
          kp:{avg:{p:'kuu'}, n:{p:'month'}}, w:['pdf','pdf','x','list']}))""")
        pg.reload(); pg.wait_for_selector("[data-fl-grid]")
        assert pg.input_value("[data-fl-period]") == "12", "väärinpäin oleva mukautettu väli hyväksyttiin"
        assert jakso(pg, "avg") == "12 kk" and jakso(pg, "n") == "Kuluva kuukausi"
        assert jarjestys(pg) == ["pdf", "list", "avg", "price", "cost", "n", "trend"]
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("kieli,otsikko,jaksot", [
    ("en", "Average consumption settings", ["This month", "Previous month"]),
    ("sv", "Inställningar för medelförbrukning", ["Denna månad", "Föregående månad"])])
def test_asetusikkunan_kaannokset(browser, base, kieli, otsikko, jaksot):
    s = avaa(browser, base, "fuel/tst1", autot=talli(), kieli=kieli, kello=KELLO)
    pg = s.page
    try:
        pg.click("[data-fl-set=avg]"); pg.wait_for_selector(".fk-sheet"); pg.wait_for_timeout(200)
        t = pg.inner_text(".fk-sheet")
        assert otsikko in t and all(j in t for j in jaksot), t
        for fi in ("Käytä sivun aikaväliä", "Palauta widgettien järjestys", "Peruuta", "Tallenna", "Aikaväli"):
            assert fi not in t, (fi, t)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("kieli,haku,osat", [
    ("fi", "järjestän", ["Tankkaus ja lataus -välilehden", "Palauta widgettien järjestys"]),
    ("en", "arrange", ["Fuel and charging tab", "Reset widget order"]),
    ("sv", "ordnar", ["Tankning och laddning", "Återställ widgetarnas ordning"])])
def test_ohjeissa_jarjestys_ja_aikavalit(browser, base, kieli, haku, osat):
    """Ohjeisiin kysymykset widgettien järjestyksestä ja korttien omasta aikavälistä (pitkä painallus ei näy itsestään)."""
    s = avaa(browser, base, "help", autot=talli(), kieli=kieli, kello=KELLO)
    pg = s.page
    try:
        pg.fill("#help-search", haku); pg.wait_for_timeout(300)
        nakyvat = pg.eval_on_selector_all(".faq:not([hidden])", "e => e.map(d => d.innerText)")
        assert any(all(o in t for o in osat) for t in nakyvat), nakyvat
        kaikki = pg.eval_on_selector_all(".faq", "e => e.map(d => d.textContent)")
        assert sum("aikav" in t.lower() or "period" in t.lower() for t in kaikki) >= 1
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("leveys", [320, 390, 430])
def test_mukautetun_paivat_ylarivin_alla(browser, base, leveys):
    """0.101: Mukautettu-jakson päivät ovat ylärivin alla koko leveydellä; valitsimet pysyvät ylärivillä (0.99:ssä
    päivät olivat ylärivin sisällä ja painike putosi omalle rivilleen)."""
    s = avaa(browser, base, "fuel/tst1", autot=talli(), leveys=leveys, kello=KELLO,
             extra={"ajoura-fuel": '{"p":"custom","cf":"2026-01-01","ct":"2026-10-29"}'})
    pg = s.page
    try:
        r = pg.evaluate("""() => {const b = e => document.querySelector(e).getBoundingClientRect();
          const bar = b('.fv-bar'), add = b('.fv-bar .fv-veh'), per = b('.fv-bar [data-fl-period]').top ? b('.fv-bar .rp-pick:has([data-fl-period])') : null,
            d = document.querySelector('[data-fl-custom]');
          return {inBar: !!d.closest('.fv-bar'), addTop: add.top, perTop: per.top, barBottom: bar.bottom, dTop: d.getBoundingClientRect().top,
            inputs: [...d.querySelectorAll('input')].map(i => i.getBoundingClientRect().width),
            over: document.getElementById('app-screen').scrollWidth - document.getElementById('app-screen').clientWidth};}""")
        assert not r["inBar"], r
        assert abs(r["addTop"] - r["perTop"]) < 2, r
        assert r["dTop"] >= r["barBottom"] - 1, r
        assert min(r["inputs"]) > 100, r
        assert r["over"] <= 0, r
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
