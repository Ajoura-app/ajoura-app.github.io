"""9. Raportit ja Tankkaus (0.102: Raportit-paneelin testit ovat tiedostossa test_raportit_paneeli.py): ajoneuvokuvat (0.50, 0.55), kululajit (0.51), ajoneuvon valinta (0.52) ja ajoneuvokortit (0.53)."""
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


# 2.02/2.04: own pictures remain whole and centered (contain), including portrait pictures.
# The image box stays within its frame and no blurred duplicate is introduced.
KUVA_JS = """sel => [...document.querySelectorAll(sel)].filter(b => b.querySelector('img')).map(b => {
    const im = b.querySelector('img'), r = b.getBoundingClientRect(), f = im.getBoundingClientRect(), cs = getComputedStyle(im);
    return {luokka: im.className, fit: cs.objectFit, y: parseFloat(cs.objectPosition.split(' ')[1]), kpl: b.querySelectorAll('img').length,
            sama: Math.abs(f.left - r.left) < 1 && Math.abs(f.top - r.top) < 1 && Math.abs(f.width - r.width) < 1 && Math.abs(f.height - r.height) < 1,
            ladattu: im.naturalWidth > 0, korkeus: r.height};})"""


@pytest.mark.parametrize("nakyma,laatikko,extra", [
    ("reports", ".rp-vpic", RP),
])
@pytest.mark.parametrize("teema", [None, "dark"])
def test_oma_kuva_sailyy_kokonaisena(browser, base, nakyma, laatikko, extra, teema):
    s = avaa(browser, base, nakyma, autot=talli(), extra=extra, teema=teema, kello=KELLO)
    try:
        tulos = s.page.evaluate(KUVA_JS, laatikko)
        assert len(tulos) == 2, tulos  # kaksi ajoneuvoa, joilla on oma kuva
        for t in tulos:
            assert t["luokka"] == "own-ph" and t["kpl"] == 1 and t["ladattu"], t
            assert t["fit"] == "contain" and t["sama"] and t["y"] == 50 and t["korkeus"] > 20, t
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tankkausikkunan_kuva(browser, base):
    s = avaa(browser, base, "fuel/a1", autot=talli(), kello=KELLO)
    try:
        s.page.click("button.fl-add")
        s.page.wait_for_selector(".sheet-thumb img.own-ph")
        t = s.page.evaluate(KUVA_JS, ".sheet-thumb")[0]
        assert t["fit"] == "contain" and t["sama"] and t["y"] == 50, t
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.54: ajoneuvonapit eivät mene ruudun yli; Raportit-sivulla ajoneuvot valitaan valikosta (kaksi valikkoa).
# 0.98: Tankkaus-välilehden yläosa on yksi kolmen laatikon rivi (ajoneuvo, jakso, Uusi tankkaus), kaikki yhtä
# korkeita ja ruudun sisällä, eikä sivu vierity sivusuunnassa.
NAPIT_JS = """() => {const sc = document.querySelector('.screen-content').getBoundingClientRect();
  const rivi = [...(document.querySelector('.fv-bar')?.children || [])].map(e => e.getBoundingClientRect());
  const b = [...document.querySelectorAll('.rp-filters .rp-pick, .fv-bar > *')];
  return {valikot: document.querySelectorAll('.rp-filters .rp-pick').length, laatikot: rivi.length,
          korkeudet: [...new Set(rivi.map(r => Math.round(r.height)))].length, ylat: [...new Set(rivi.map(r => Math.round(r.top)))].length,
          alaotsikko: document.querySelectorAll('.rp-lead').length,
          yli: b.filter(e => {const r = e.getBoundingClientRect(); return r.left < sc.left - 0.5 || r.right > sc.right + 0.5;}).length,
          sivu: document.querySelector('#app-screen').scrollWidth - document.querySelector('#app-screen').clientWidth};}"""


def kuusi_autoa():
    autot = talli() + [tiedot.auto(f"b{i}", name=f"Lisäauto {i}", plate=f"TST-30{i}",
                                   fuels=[T(f"g{i}1", "2026-09-01", 1000, 40, 70), T(f"g{i}2", "2026-10-01", 1600, 40, 70)])
                       for i in range(3)]
    autot[1]["fuels"] = [T("h1", "2026-09-01", 85000, 40, 70), T("h2", "2026-10-01", 85700, 40, 70)]
    return autot


@pytest.mark.parametrize("leveys", [320, 390, 430])
@pytest.mark.parametrize("nakyma,extra,valikot,laatikot", [("fuel/a1", {}, 0, 2),
                                                           ("fuel", {"ajoura-fuel": '{"p":"12","t":"cmp"}'}, 0, 2),
                                                           ("reports", RP, 0, 2)])
def test_ajoneuvonapit_ruudulla(browser, base, leveys, nakyma, extra, valikot, laatikot):
    s = avaa(browser, base, nakyma, autot=kuusi_autoa(), leveys=leveys, extra=extra, kello=KELLO)
    try:
        r = s.page.evaluate(NAPIT_JS)
        assert r["valikot"] == valikot and r["laatikot"] == laatikot and r["alaotsikko"] == 0, r
        if laatikot:
            assert r["korkeudet"] == 1 and r["ylat"] == 1, r  # samankorkuiset, samalla rivillä
        assert r["yli"] == 0 and r["sivu"] <= 0, r
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.98: Tankkaus-välilehden ajoneuvovalikko: ajoneuvon napautus vaihtaa ajoneuvon ja sulkee valikon; valinta muistetaan,
# jakso säilyy ja laatikossa näkyy valitun rekisteri.
def test_tankkaus_ajoneuvovalikko(browser, base):
    s = avaa(browser, base, "fuel/a1", autot=kuusi_autoa(), kello=KELLO)
    pg = s.page
    try:
        assert "TST-201" in pg.inner_text(".fv-veh>summary")
        pg.select_option("[data-fl-period]", "all"); pg.wait_for_timeout(150)
        pg.click(".fv-veh>summary"); pg.click('[data-fl-car="a2"]'); pg.wait_for_timeout(150)
        assert pg.evaluate("location.hash") == "#fuel/a2"
        assert "TST-202" in pg.inner_text(".fv-veh>summary") and pg.evaluate("document.querySelector('.fv-veh').open") is False
        assert "Testi Farmari" in pg.inner_text(".rp-pdf")
        assert '"car":"a2"' in pg.evaluate("localStorage.getItem('ajoura-fuel')")
        assert pg.input_value("[data-fl-period]") == "all"  # jakso säilyy
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


# 0.98: vertailu valitaan ajoneuvovalikon ruksilla: toinen ruksi vaihtaa vertailuun ja valikko pysyy auki, ajoneuvo ilman
# tankkauksia ei ole ruksittavissa, yksi jäljelle jäävä ruksi palaa sen ajoneuvon näkymään, viimeistä ei voi poistaa.
VERT_JS = """() => {const d = document.querySelector('.fv-veh'), sc = document.querySelector('.screen-content').getBoundingClientRect();
  const l = d?.querySelector('.fl-cmenu-list').getBoundingClientRect();
  return {auki: d?.open, teksti: d?.querySelector('summary .rp-pick-t').innerText.replace(/\\s+/g, ' ').trim(),
    valitut: [...document.querySelectorAll('[data-fl-cmpcar]')].map(b => [b.dataset.flCmpcar, b.getAttribute('aria-pressed'), b.disabled]),
    rivit: [...document.querySelectorAll('.fl-srows .fl-srn span[translate]')].map(e => e.textContent),
    yksi: !!document.querySelector('.fl-big'), hash: location.hash,
    sisalla: !d?.open || (l.left >= sc.left - 0.5 && l.right <= sc.right + 0.5),
    off: JSON.parse(localStorage.getItem('ajoura-fuel') || '{}').off || []};}"""


@pytest.mark.parametrize("leveys", [320, 390])
def test_vertailu_ajoneuvovalikko(browser, base, leveys):
    s = avaa(browser, base, "fuel/a1", autot=kuusi_autoa(), leveys=leveys, extra={"ajoura-fuel": '{"p":"12","t":"car"}'}, kello=KELLO)
    pg = s.page
    try:
        pg.click(".fv-veh>summary")
        r = pg.evaluate(VERT_JS)
        assert r["auki"] and r["sisalla"] and r["yksi"], r
        assert ["a3", "false", True] in r["valitut"] and ["a1", "true", False] in r["valitut"] and ["a2", "false", False] in r["valitut"], r
        pg.click('[data-fl-cmpcar="a2"]'); pg.wait_for_timeout(150)
        r = pg.evaluate(VERT_JS)
        assert r["auki"] and not r["yksi"] and sorted(r["rivit"]) == ["Testi Farmari", "Testi Pakettiauto"] and r["teksti"] == "2 valittu", r
        assert pg.evaluate("document.activeElement?.dataset.flCmpcar") == "a2"
        for i in ("b0", "b1", "b2"):
            pg.click(f'[data-fl-cmpcar="{i}"]'); pg.wait_for_timeout(100)
        assert pg.evaluate(VERT_JS)["teksti"] == "Kaikki"
        pg.click(".app-heading"); pg.wait_for_timeout(100)  # napautus valikon ulkopuolelle sulkee sen
        assert pg.evaluate(VERT_JS)["auki"] is False
        pg.click(".fv-veh>summary")
        for i in ("b0", "b1", "b2", "a1"):
            pg.click(f'[data-fl-cmpcar="{i}"]'); pg.wait_for_timeout(100)
        r = pg.evaluate(VERT_JS)  # vain Farmari jäljellä → sen oma näkymä
        assert r["yksi"] and r["hash"] == "#fuel/a2" and "TST-202" in r["teksti"], r
        pg.click('[data-fl-cmpcar="a2"]'); pg.wait_for_timeout(100)  # viimeistä ei poisteta
        assert pg.evaluate(VERT_JS)["yksi"]
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.61: iPhone avaa alasvetovalikon aina, kun se saa fokuksen. Valinnan jälkeen sivu piirretään uudelleen, ja
# ennen 0.61:tä fokus palautettiin valikkoon, jolloin valikko aukesi itsestään uudelleen. Kosketusnäytöllä fokusta
# ei palauteta valikkoon; tietokoneella (näppäimistö) se palautetaan kuten ennen.
@pytest.mark.parametrize("mobiili", [True, False])
@pytest.mark.parametrize("nakyma,extra,valikko,arvo", [
    ("reports", RP, "[data-rp-period]", "all"),
    ("fuel/a1", {}, "[data-fl-period]", "all"),
])
def test_valikon_fokus(browser, base, mobiili, nakyma, extra, valikko, arvo):
    s = avaa(browser, base, nakyma, autot=kuusi_autoa(), extra=extra, mobiili=mobiili, kello=KELLO)
    try:
        s.page.focus(valikko)
        s.page.select_option(valikko, arvo); s.page.wait_for_timeout(150)
        assert s.page.input_value(valikko) == arvo
        fokus = s.page.evaluate(f"document.activeElement?.matches('{valikko}')")
        assert fokus is (not mobiili), (mobiili, fokus)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tankkaus_edellinen_vuosi(browser, base):
    autot = talli()
    autot[0]["fuels"] = [T("g1", "2025-03-01", 120000, 50, 90), T("g2", "2025-04-01", 120800, 60, 108)]
    s = avaa(browser, base, "fuel/a1", autot=autot, extra={"ajoura-fuel": '{"p":"prev","t":"car"}'}, kello=KELLO)
    try:
        assert s.page.input_value("[data-fl-period]") == "prev"
        assert "198 €" in s.page.inner_text(".fl-sum").replace(" ", " ")
        assert "7,5" in s.page.inner_text(".fl-big")  # 60 l / 800 km
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.81: Tankkaus → Vertailu mobiilissa: ajoneuvon koko nimi (ei katkaistu), puuttuva arvo "Ei tietoa" syineen ilman
# nollapalkkia, nimet kaavion selitteessä (ei katkaistuja nimiä viivojen päissä), yhteenveto riveinä ja kulujen summa.
VERT2_JS = """() => {const sc = document.querySelector('.screen-content'), b = sc.getBoundingClientRect();
  const katki = e => e.scrollWidth > e.clientWidth + 1 || getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth;
  return {palkit: [...document.querySelectorAll('.fl-bar')].map(r => [r.querySelector('.fl-bn span[translate]').textContent, !!r.querySelector('.fl-btrack'), r.querySelector('.fl-none, .fl-bv')?.innerText.replace(/\\s+/g, ' '), r.querySelector('.fl-why')?.textContent || '']),
    katkenneet: [...document.querySelectorAll('.fl-bn, .fl-srn span[translate], .fl-lgd span[translate]')].filter(katki).map(e => e.textContent),
    paat: document.querySelectorAll('.fl-chart .cend').length, selite: [...document.querySelectorAll('.fl-lgd span[translate]')].map(e => e.textContent),
    rivit: [...document.querySelectorAll('.fl-srows li')].map(l => l.innerText.replace(/\\s+/g, ' ')), yht: document.querySelector('.fl-stot')?.innerText.replace(/\\s+/g, ' '),
    yli: sc.scrollWidth - sc.clientWidth, taulukko: document.querySelectorAll('.fl-ctable').length};}"""


@pytest.mark.parametrize("kieli", ["fi", "sv"])
@pytest.mark.parametrize("leveys", [320, 390])
def test_tankkaus_vertailu_mobiilissa(browser, base, kieli, leveys):
    autot = kuusi_autoa()[:3]
    pitka = "Volkswagen Passat Variant 2.0 TDI Highline"
    autot[1]["name"] = pitka
    autot[0]["fuels"] = [T("f1", "2026-09-01", 148000, 60, 110)]  # yksi tankkaus: kulutusta ei voi laskea
    autot[2]["fuels"] = [T("q1", "2026-08-01", 60000, 40, 70), T("q2", "2026-09-01", 60600, 45, 80), T("q3", "2026-10-01", 61200, 44, 79)]
    s = avaa(browser, base, "fuel", autot=autot, kieli=kieli, leveys=leveys, extra={"ajoura-fuel": '{"p":"12","t":"cmp","m":"cons"}'}, kello=KELLO)
    try:
        r = s.page.evaluate(VERT2_JS)
        nimet = [x[0] for x in r["palkit"]]
        assert pitka in nimet and not r["katkenneet"] and r["yli"] <= 0, r
        puuttuu = next(x for x in r["palkit"] if x[0] == "Testi Pakettiauto")
        assert not puuttuu[1] and puuttuu[2] in ("Ei tietoa", "Ingen data") and puuttuu[3], r  # ei nollapalkkia, syy kerrottu
        assert r["paat"] == 0 and pitka in r["selite"] and "Testi Pakettiauto" not in r["selite"], r  # vain ajoneuvot, joilla on pisteitä
        assert len(r["rivit"]) == 3 and r["taulukko"] == 0 and "479" in r["yht"].replace("\u00a0", ""), r  # 110 + 140 + 229 €
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.82: Raportit-PDF:ssä kuluton ajoneuvo on "–" kuten näytöllä (0.78), ei 0 €: puuttuva kirjaus ei ole nollakulu.
@pytest.mark.skipif(not __import__("shutil").which("pdftotext"), reason="pdftotext puuttuu")
def test_pdf_kuluton_ajoneuvo(browser, base, tmp_path):
    import subprocess
    autot = talli() + [tiedot.auto("a4", name="Testi Tyhjä", plate="TST-204", km=50000)]
    s = avaa(browser, base, "reports", autot=autot, mobiili=False, extra={"ajoura-reports": '{"p":"year","t":"sum"}'}, kello=KELLO)
    try:
        with s.page.expect_download() as d:
            s.page.click("[data-rp-pdf]")
        pdf = tmp_path / "kulut.pdf"; d.value.save_as(pdf)
        teksti = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True).stdout
        rivit = [r for r in teksti.splitlines() if "Testi Tyhjä" in r]
        assert len(rivit) == 2 and all("0 €" not in r and not r.rstrip().endswith(" 0") for r in rivit), rivit
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
