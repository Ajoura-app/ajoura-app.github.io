"""0.67: polttoainelajit kaikille ajoneuvoille, sähkölataus ja hybridit (polttoaine ja sähkö samalla Tankkaus-välilehdellä).

Tallennus: lataus on tankkaus, jolla on valinnainen kenttä el: true (sähköauton kaikki kirjaukset ovat latauksia ilman
merkintää). Vanhat tiedot eivät muutu; hybridin kulutus lasketaan polttoaineelle ja sähkölle erikseen.
"""
import json

import pytest

import tiedot
from apu import KELLO, avaa, ikkuna_valmis
from test_tankkaus import fi, keskikulutus
from test_varmuuskopio import kanoninen, palauta, tallenna_ladaten

T = tiedot.tankkaus
F = "#quickfuel-form"
PREF = {"ajoura-fuel": '{"p":"12","t":"car"}'}


def hybridi():
    return tiedot.auto(id="hyb1", name="Toyota Prius Plug-in", plate="HYB-001", fuel="Lataushybridi", km=152000, fuels=[
        T("p1", "2026-06-01", 150000, 30.0, 54.0), T("p2", "2026-07-01", 150800, 25.0, 45.0),
        T("p3", "2026-08-01", 151400, 28.0, 50.4),
        T("s1", "2026-06-10", 150300, 10.0, 3.0, el=True), T("s2", "2026-07-10", 151000, 12.0, 3.6, el=True),
        T("s3", "2026-08-10", 151700, 14.0, 4.2, el=True)])


def valinnat(pg):
    return pg.eval_on_selector_all(F + " [name=grade] option", "o => o.map(x => x.textContent.trim())")


@pytest.mark.parametrize("polttoaine,ensin", [("Diesel", "Diesel"), ("Bensiini", "95 E10")])
def test_kaikki_polttoainelajit_valittavissa(browser, base, polttoaine, ensin):
    """Ennen vain oman käyttövoiman lajit: dieselillä vain Diesel ja HVO100. Nyt bensiini ja diesel kaikille, oma ensin."""
    s = avaa(browser, base, "fuel/tst1", autot=[tiedot.auto(fuel=polttoaine, fuels=[T("f1", "2026-07-01", 151000, 50.0, 85.0)])],
             extra=PREF, kello=KELLO)
    try:
        s.page.click(".fl-add"); s.page.wait_for_selector(F); ikkuna_valmis(s.page)
        v = valinnat(s.page)
        assert v[0] == ensin and set(v) == {"95 E10", "98 E5", "E85", "Diesel", "HVO100"}, v
        assert s.page.query_selector(".fl-kinds") is None and s.page.query_selector(".sf-kinds") is None
        s.page.select_option(F + " [name=grade]", "98 E5")
        s.page.fill(F + " [name=km]", "151500"); s.page.fill(F + " [name=qty]", "40"); s.page.fill(F + " [name=cost]", "76")
        s.page.click(F + " [type=submit]"); s.page.wait_for_selector(F, state="detached")
        uusi = next(x for x in s.talli()["cars"][0]["fuels"] if x["km"] == 151500)
        assert uusi["grade"] == "98 E5" and "el" not in uusi
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_kaasu_kiloina(browser, base):
    """0.69: kaasu (maa- ja biokaasu) kirjataan kiloina, kulutus kg/100 km; kaasuautolla bensiini varapolttoaineena."""
    auto = tiedot.auto(id="gas1", fuel="Kaasu", fuels=[T("g1", "2026-06-01", 150000, 15.0, 27.0, grade="Biokaasu"),
                                                       T("g2", "2026-07-01", 150500, 14.0, 25.2, grade="Biokaasu")])
    s = avaa(browser, base, "fuel/gas1", autot=[auto], extra=PREF, kello=KELLO)
    pg = s.page
    try:
        pg.wait_for_selector(".fl-kinds")
        assert pg.get_attribute("[data-fl-kind=all]", "aria-pressed") == "true"
        pg.click("[data-fl-kind=gas]"); pg.wait_for_selector(".fl-big")
        assert "kg/100 km" in pg.inner_text(".fl-big") and fi(14.0 / 500 * 100) in pg.inner_text(".fl-big")
        assert "Kaasu" in pg.inner_text("[data-fl-kind=gas]") and pg.get_attribute("[data-fl-kind=gas]", "aria-pressed") == "true"
        pg.click(".fl-add"); pg.wait_for_selector(F); ikkuna_valmis(pg)
        assert valinnat(pg) == ["Biokaasu", "Maakaasu"] and "kg" in pg.inner_text(F + " .sf-calc")
        assert "Litrat" not in pg.inner_text(F + " .sf-calc")
        pg.select_option(F + " [name=grade]", "Maakaasu")
        pg.fill(F + " [name=km]", "151000"); pg.fill(F + " [name=qty]", "13"); pg.fill(F + " [name=cost]", "20")
        pg.click(F + " [type=submit]"); pg.wait_for_selector(F, state="detached")
        uusi = next(x for x in s.talli()["cars"][0]["fuels"] if x["km"] == 151000)
        assert uusi["grade"] == "Maakaasu" and uusi["qty"] == 13 and "el" not in uusi
        # Bensiini varapolttoaineena: oma laji, litrat, ei sekoitu kaasun kiloihin.
        pg.click("[data-fl-kind=fuel]"); pg.wait_for_function("() => document.querySelector('[data-fl-kind=fuel]').getAttribute('aria-pressed')==='true'")
        pg.click(".fl-add"); pg.wait_for_selector(F); ikkuna_valmis(pg)
        assert valinnat(pg)[0] == "95 E10" and "Litrat" in pg.inner_text(F + " .sf-calc")
        pg.fill(F + " [name=km]", "151100"); pg.fill(F + " [name=qty]", "20"); pg.fill(F + " [name=cost]", "36")
        pg.click(F + " [type=submit]"); pg.wait_for_selector(F, state="detached")
        assert next(x for x in s.talli()["cars"][0]["fuels"] if x["km"] == 151100)["grade"] == "95 E10"
        pg.click("[data-fl-kind=gas]"); pg.wait_for_function("() => document.querySelector('[data-fl-kind=gas]').getAttribute('aria-pressed')==='true'")
        assert "kg/100 km" in pg.inner_text(".fl-big") and "l/100" not in pg.inner_text(".fl-big").replace("kg/100", "")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_hybridi_polttoaine_ja_sahko_erikseen(browser, base):
    h = hybridi()
    fuel_fills = [f for f in h["fuels"] if not f.get("el")]
    el_fills = [f for f in h["fuels"] if f.get("el")]
    s = avaa(browser, base, "fuel/hyb1", autot=[h], extra=PREF, kello=KELLO)
    pg = s.page
    try:
        pg.wait_for_selector(".fl-kinds")
        # 0.70: oletuksena Yhteensä: molemmat lajit, kulut yhteensä ja ajon hinta (62 + 11 € ... laskettu alla).
        assert pg.get_attribute("[data-fl-kind=all]", "aria-pressed") == "true"
        kk = pg.inner_text(".fl-all").replace("\u00a0", " ")
        assert "l/100 km" in kk and "kWh/100 km" in kk and "Polttoaine" in kk and "Sähkö" in kk, kk
        kulut = round(sum(f["cost"] for f in h["fuels"]))  # 160 € (aikaväli 12 kk kattaa kaikki)
        assert f"{kulut} €" in kk, kk
        pg.click("[data-fl-kind=fuel]"); pg.wait_for_function("() => document.querySelector('[data-fl-kind=fuel]').getAttribute('aria-pressed')==='true'")
        assert pg.get_attribute("[data-fl-kind=fuel]", "aria-pressed") == "true"
        assert fi(keskikulutus(fuel_fills)) in pg.inner_text(".fl-big") and "l/100 km" in pg.inner_text(".fl-big")
        assert "Kulut yhteensä" in pg.inner_text(".fl-sum") and "149 €" in pg.inner_text(".fl-sum")  # 54 + 45 + 50,4
        pg.click("[data-fl-kind=el]"); pg.wait_for_function("() => document.querySelector('[data-fl-kind=el]').getAttribute('aria-pressed')==='true'")
        assert fi(keskikulutus(el_fills)) in pg.inner_text(".fl-big") and "kWh/100 km" in pg.inner_text(".fl-big")
        assert "Lataukset" in pg.inner_text(".fl-sum") and "11 €" in pg.inner_text(".fl-sum")  # 3 + 3,6 + 4,2
        assert pg.get_attribute(".fl-add", "aria-label") == "Lisää lataus"  # 0.107: kelluva ＋
        # Uusi lataus: tallentuu el: true, kWh, ei litroja.
        pg.click(".fl-add"); pg.wait_for_selector(F); ikkuna_valmis(pg)
        assert pg.query_selector(F + " [name=grade]") is None, "sähkölle ei polttoainelajia"
        pg.fill(F + " [name=km]", "152000"); pg.fill(F + " [name=ppu]", "0.30"); pg.fill(F + " [name=qty]", "15")
        assert pg.input_value(F + " [name=cost]").replace(",", ".").startswith("4.5")
        pg.click(F + " [type=submit]"); pg.wait_for_selector(F, state="detached")
        fuels = s.talli()["cars"][0]["fuels"]
        uusi = next(x for x in fuels if x["km"] == 152000)
        assert uusi["el"] is True and uusi["qty"] == 15 and abs(uusi["cost"] - 4.5) < 0.01 and "grade" not in uusi
        assert "✓ Lataus tallennettu." in pg.inner_text("#app-screen")
        assert sum(1 for x in fuels if x.get("el")) == 4 and sum(1 for x in fuels if not x.get("el")) == 3
        # Polttoainenäkymä ei muutu latauksesta.
        pg.click("[data-fl-kind=fuel]"); pg.wait_for_function("() => document.querySelector('[data-fl-kind=fuel]').getAttribute('aria-pressed')==='true'")
        assert fi(keskikulutus(fuel_fills)) in pg.inner_text(".fl-big")
        # Uusi tankkaus: ei el-merkintää.
        pg.click(".fl-add"); pg.wait_for_selector(F); ikkuna_valmis(pg)
        assert "98 E5" in pg.inner_text(F + " [name=grade]")
        pg.fill(F + " [name=km]", "152100"); pg.fill(F + " [name=qty]", "20"); pg.fill(F + " [name=cost]", "36")
        pg.click(F + " [type=submit]"); pg.wait_for_selector(F, state="detached")
        assert "el" not in next(x for x in s.talli()["cars"][0]["fuels"] if x["km"] == 152100)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_kirjausikkunan_valitsin_ja_muokkaus(browser, base):
    """Etusivun tankkaus- ja latauspainike (0.88: kuvake, nimi "Lisää tankkaus tai lataus"): ikkunassa valitaan laji;
    latauksen muokkaus avaa latauksen."""
    s = avaa(browser, base, "home", autot=[hybridi()], kello=KELLO)
    pg = s.page
    try:
        assert pg.get_attribute(".row-btn.fuel", "aria-label") == "Lisää tankkaus tai lataus"
        pg.click("[data-quickfuel=hyb1]"); pg.wait_for_selector(F); ikkuna_valmis(pg)
        assert pg.get_attribute("[data-sheet-kind=fuel]", "aria-pressed") == "true"
        pg.click("[data-sheet-kind=el]"); pg.wait_for_function("() => document.querySelector('[data-sheet-kind=el]').getAttribute('aria-pressed')==='true'")
        ikkuna_valmis(pg)  # lajin vaihto avaa ikkunan uudelleen; kirjoitetaan vasta, kun kohdistus on siirtynyt siihen
        assert pg.input_value(F + " [name=kind]") == "el" and "Uusi lataus" in pg.inner_text("#sheet-title")
        pg.fill(F + " [name=km]", "152200"); pg.fill(F + " [name=qty]", "9"); pg.fill(F + " [name=cost]", "2.7")
        pg.click(F + " [type=submit]"); pg.wait_for_selector(F, state="detached")
        assert next(x for x in s.talli()["cars"][0]["fuels"] if x["km"] == 152200)["el"] is True
        # Muokkaus: kirjauksen laji säilyy, ikkunassa ei valitsinta.
        pg.goto(pg.url.split("#")[0] + "#fuel/hyb1"); pg.wait_for_selector(".fl-kinds")
        pg.click("[data-fl-kind=el]"); pg.wait_for_selector("[data-fl-edit=s1]", state="attached")
        pg.evaluate("document.querySelector('[data-fl-edit=s1]').closest('details').open = true")
        pg.click("[data-fl-edit=s1]"); pg.wait_for_selector(F + "[data-edit]")
        assert pg.query_selector(".sf-kinds") is None and pg.input_value(F + " [name=kind]") == "el"
        pg.fill(F + " [name=qty]", "11"); pg.click(F + " [type=submit]"); pg.wait_for_selector(F, state="detached")
        s1 = next(x for x in s.talli()["cars"][0]["fuels"] if x["id"] == "s1")
        assert s1["el"] is True and s1["qty"] == 11
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_sahkoauto_lataus_ilman_merkintaa(browser, base):
    """Sähköauton kaikki kirjaukset ovat latauksia: el-kenttää ei tallenneta eikä lajivalitsinta näytetä."""
    ev = tiedot.auto(id="ev1", fuel="Sähkö", fuels=[T("f1", "2026-09-01", 150000, 40.0, 10.0)])
    s = avaa(browser, base, "fuel/ev1", autot=[ev], extra=PREF, kello=KELLO)
    try:
        assert s.page.query_selector(".fl-kinds") is None
        s.page.click(".fl-add"); s.page.wait_for_selector(F); ikkuna_valmis(s.page)
        assert s.page.query_selector(F + " [name=grade]") is None
        s.page.fill(F + " [name=km]", "150500"); s.page.fill(F + " [name=qty]", "42"); s.page.fill(F + " [name=cost]", "12")
        s.page.click(F + " [type=submit]"); s.page.wait_for_selector(F, state="detached")
        assert "el" not in next(x for x in s.talli()["cars"][0]["fuels"] if x["km"] == 150500)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_raportit_ja_ajoneuvosivu_hybridi(browser, base):
    s = avaa(browser, base, "reports", autot=[hybridi()], kello=KELLO)
    pg = s.page
    try:
        pg.click(".rp-veh>summary"); pg.click('.rp-veh [data-rp-car="hyb1"]'); pg.wait_for_selector(".rp-rep")  # 0.102: valitun ajoneuvon raportit
        kirjat = pg.eval_on_selector_all("a.rp-rep[href*='#fuel/']", "a => a.map(x => x.innerText.replace(/\\s+/g, ' '))")
        assert len(kirjat) == 2 and "Tankkauskirja" in kirjat[0] and "Latauskirja" in kirjat[1], kirjat
        pg.click("a.rp-rep[href*='#fuel/'] >> nth=1"); pg.wait_for_selector(".fl-kinds")
        assert pg.get_attribute("[data-fl-kind=el]", "aria-pressed") == "true", "Latauskirja avautui polttoainenäkymään"
        pg.goto(pg.url.split("#")[0] + "#vehicle/hyb1"); pg.wait_for_selector("a.fuel-link[href*='#fuel/']")
        kortti = pg.inner_text("a.fuel-link[href*='#fuel/']")
        assert "Tankkaus ja lataus" in kortti and "kWh/100 km" in kortti and "l/100 km" in kortti, kortti
        pg.goto(pg.url.split("#")[0] + "#report/hyb1"); pg.wait_for_selector(".report-facts")
        facts = pg.inner_text(".report-facts")
        assert "Keskikulutus, polttoaine" in facts and "Keskikulutus, sähkö" in facts and "Latauskulut" in facts, facts
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_hybridin_varmuuskopio_palautuu(browser, base, tmp_path):
    alku = [hybridi()]
    s = avaa(browser, base, "me", autot=alku, mobiili=False, leveys=1280, korkeus=900, kello=KELLO)
    try:
        polku = tallenna_ladaten(s, tmp_path)
        d = json.loads(polku.read_text("utf-8"))
        assert sum(1 for f in d["cars"][0]["fuels"] if f.get("el") is True) == 3
        assert kanoninen(d["cars"]) == kanoninen(alku)
    finally:
        s.sulje()
    t = avaa(browser, base, "me", autot=None, mobiili=False, leveys=1280, korkeus=900, kello=KELLO)
    try:
        palauta(t, polku)
        assert kanoninen(t.talli()["cars"]) == kanoninen(alku)
        assert not t.virheet, t.virheet
    finally:
        t.sulje()


@pytest.mark.laaja
def test_lataus_edellisessa_versiossa(browser, vanha_base):
    """Edellinen versio (ennen 0.67) säilyttää latauskirjaukset latautuessaan: validFill hyväksyy tuntemattoman kentän."""
    s = avaa(browser, vanha_base, "fuel/hyb1", autot=[hybridi()], kello=KELLO)
    try:
        s.page.reload(); s.page.wait_for_timeout(400)
        fuels = s.talli()["cars"][0]["fuels"]
        assert len(fuels) == 6 and sum(1 for f in fuels if f.get("el") is True) == 3
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_vertailu_hybridi_kokonaishinta(browser, base):
    """0.71: Vertailussa hybridin Ajon hinta ja Kulut sisältävät polttoaineen ja sähkön; kulutusta ei lasketa yhteen."""
    h = hybridi()
    diesel = tiedot.auto(fuels=[T("d1", "2026-06-01", 150000, 50.0, 90.0), T("d2", "2026-08-01", 152000, 80.0, 144.0)])
    s = avaa(browser, base, "fuel/hyb1", autot=[h, diesel], kello=KELLO,
             extra={"ajoura-fuel": '{"p":"12","t":"cmp","m":"price"}'})
    pg = s.page
    try:
        pg.wait_for_selector(".fv-veh"); pg.click(".fv-veh>summary"); pg.click("[data-fl-cmpcar=tst1]"); pg.click(".fv-veh>summary")  # 0.98: vertailu ruksilla, valikko kiinni
        pg.wait_for_selector(".fl-srows")  # 0.81: yhteenveto riveinä (ennen taulukko .fl-ctable)
        rivi = next(r for r in pg.eval_on_selector_all(".fl-srows li", "t => t.map(x => x.innerText.replace(/\\s+/g, ' '))") if "Prius" in r)
        kulut = round(sum(f["cost"] for f in h["fuels"]))  # 160 € = 149 € polttoaine + 11 € sähkö
        assert f"{kulut}" in rivi and "8,01" in rivi, rivi  # 160,2 € / 2 000 km
        assert "3,8 l" in rivi and "1,9 kWh" in rivi, rivi
        pg.click("[data-fl-metric=cons]"); pg.wait_for_selector(".fl-note")
        assert "kulutusta ei voi laskea yhteen" in pg.inner_text(".fl-note").replace("\n", " ") or "kulutusta ei voi laskea yhteen" in pg.inner_text("#app-screen")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
