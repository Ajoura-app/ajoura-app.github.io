"""4. Tankkaus: ikkuna, laskenta, muokkaus ja keskikulutus (täydestä täyteen, sama sääntö kuin app.js fuelStats)."""
import pytest

import tiedot
from apu import KELLO, TANAAN, avaa, ikkuna_valmis


def keskikulutus(fills):
    """Täydestä täyteen: välin litrat (edellisen täyden jälkeen) / välin km × 100."""
    f = sorted(fills, key=lambda x: (x["km"], x["date"]))
    taydet = [i for i, x in enumerate(f) if x["full"]]
    q = d = 0
    for a, b in zip(taydet, taydet[1:]):
        if f[b]["km"] > f[a]["km"] and not any(x.get("skip") for x in f[a + 1:b + 1]):  # 0.58: Älä huomioi
            q += sum(x["qty"] for x in f[a + 1:b + 1])
            d += f[b]["km"] - f[a]["km"]
    return q / d * 100 if d else None


def fi(v):
    return f"{v:.1f}".replace(".", ",")


def test_uusi_tankkaus_ja_muokkaus(browser, base):
    autot = [tiedot.auto(fuels=[tiedot.tankkaus("f1", "2026-07-01", 151000, 50.0, 85.0),
                                tiedot.tankkaus("f2", "2026-07-20", 151750, 41.2, 70.5),
                                tiedot.tankkaus("f3", "2026-08-05", 152000, 20.0, 35.0, taysi=False)])]
    s = avaa(browser, base, "fuel/tst1", autot=autot, kello=KELLO)
    pg = s.page
    try:
        assert fi(keskikulutus(autot[0]["fuels"])) in pg.inner_text(".fl-big")

        pg.click(".fl-add")
        f = "#quickfuel-form"
        pg.wait_for_selector(f); ikkuna_valmis(pg)
        pg.fill(f + " [name=km]", "152400")
        pg.fill(f + " [name=ppu]", "1.80")
        pg.fill(f + " [name=cost]", "72")
        assert pg.input_value(f + " [name=qty]").replace(",", ".").startswith("40"), "litroja ei laskettu summasta ja hinnasta"
        pg.click(f + " [type=submit]")
        pg.wait_for_selector(f, state="detached")
        fuels = s.talli()["cars"][0]["fuels"]
        assert len(fuels) == 4
        uusi = next(x for x in fuels if x["id"] not in ("f1", "f2", "f3"))
        assert (uusi["km"], uusi["qty"], uusi["cost"], uusi["full"], uusi["date"]) == (152400, 40, 72, True, TANAAN)
        assert fi(keskikulutus(fuels)) in pg.inner_text(".fl-big"), "keskikulutus ei vastaa laskettua"

        # Muokkaus: litrojen muutos laskee summan uudelleen, id säilyy.
        pg.click(f"[data-fl-edit='{uusi['id']}']")
        pg.wait_for_selector(f + "[data-edit]")
        pg.fill(f + " [name=qty]", "45")
        pg.click(f + " [type=submit]")
        pg.wait_for_selector(f, state="detached")
        muokattu = next(x for x in s.talli()["cars"][0]["fuels"] if x["id"] == uusi["id"])
        assert muokattu["qty"] == 45 and abs(muokattu["cost"] - 81) < 0.01
        assert len(s.talli()["cars"][0]["fuels"]) == 4
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_poisto_ikkunasta(browser, base):
    autot = [tiedot.auto(fuels=[tiedot.tankkaus("f1", "2026-07-01", 151000, 50.0, 85.0),
                                tiedot.tankkaus("f2", "2026-07-20", 151750, 41.2, 70.5)])]
    s = avaa(browser, base, "fuel/tst1", autot=autot, kello=KELLO)
    pg = s.page
    try:
        pg.click("[data-fl-edit='f2']")
        pg.click("#quickfuel-form [data-fl-del]")
        pg.wait_for_timeout(400)
        assert [x["id"] for x in s.talli()["cars"][0]["fuels"]] == ["f1"]
    finally:
        s.sulje()


# 0.58: "Älä huomioi kulutuksessa" (skip) jättää välin pois keskikulutuksesta; litrat ja kulut lasketaan yhä.
def skip_talli():
    T = tiedot.tankkaus
    return [tiedot.auto(fuels=[T("f1", "2026-06-01", 150000, 50.0, 90.0), T("f2", "2026-07-01", 150500, 40.0, 72.0),
                               T("f3", "2026-08-01", 151000, 50.0, 90.0, skip=True),  # joku muu tankkasi välissä
                               T("f4", "2026-09-01", 151500, 40.0, 72.0)])]


def test_ala_huomioi_kulutuksessa(browser, base):
    autot = skip_talli()
    assert fi(keskikulutus(autot[0]["fuels"])) == "8,0"  # ilman merkintää 8,7
    s = avaa(browser, base, "fuel/tst1", autot=autot, extra={"ajoura-fuel": '{"p":"12","t":"car"}'}, kello=KELLO)
    pg = s.page
    try:
        assert "8,0" in pg.inner_text(".fl-big")
        assert "ei kulutukseen" in pg.inner_text("[data-fl-edit='f3']")
        f = "#quickfuel-form"
        # Merkintä pois muokkauksessa → väli lasketaan taas.
        pg.click("[data-fl-edit='f3']"); pg.wait_for_selector(f + "[data-edit]")
        assert pg.is_checked(f + " [name=skip]")
        pg.uncheck(f + " [name=skip]"); pg.click(f + " [type=submit]"); pg.wait_for_selector(f, state="detached")
        f3 = next(x for x in s.talli()["cars"][0]["fuels"] if x["id"] == "f3")
        assert "skip" not in f3 and f3["qty"] == 50
        assert fi(keskikulutus(s.talli()["cars"][0]["fuels"])) in pg.inner_text(".fl-big")
        # Uusi tankkaus merkinnällä: tallentuu skip: true, kulut mukana.
        pg.click(".fl-add"); pg.wait_for_selector(f); ikkuna_valmis(pg)
        pg.fill(f + " [name=km]", "152000"); pg.fill(f + " [name=qty]", "60"); pg.fill(f + " [name=cost]", "108")
        pg.check(f + " [name=skip]"); pg.click(f + " [type=submit]"); pg.wait_for_selector(f, state="detached")
        fuels = s.talli()["cars"][0]["fuels"]
        uusi = next(x for x in fuels if x["km"] == 152000)
        assert uusi["skip"] is True and uusi["qty"] == 60 and uusi["cost"] == 108
        assert fi(keskikulutus(fuels)) in pg.inner_text(".fl-big")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_ala_huomioi_sailyy_ja_raportit(browser, base):
    """Merkintä säilyy uudelleenlatauksessa, Raportit-sivun polttoainekulut sisältävät tankkauksen."""
    s = avaa(browser, base, "fuel/tst1", autot=skip_talli(), extra={"ajoura-fuel": '{"p":"12","t":"car"}'}, kello=KELLO)
    try:
        s.page.reload(); s.page.wait_for_selector(".fl-big")
        assert next(x for x in s.talli()["cars"][0]["fuels"] if x["id"] == "f3").get("skip") is True
        assert "8,0" in s.page.inner_text(".fl-big")
        s.page.goto(s.page.url.split("#")[0] + "#reports"); s.page.wait_for_timeout(400)
        assert "324" in s.page.inner_text(".rp-total")  # 90 + 72 + 90 + 72 € (kaikki 12 kk:n sisällä); 0.78: .rp-total
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.laaja
def test_ala_huomioi_edellisessa_versiossa(browser, vanha_base):
    """Edellinen versio (ennen 0.58) ei poista merkittyä tankkausta latautuessaan eikä tallentaessaan (palautus vanhaan
    versioon on turvallinen): validFill hyväksyy tuntemattoman kentän."""
    s = avaa(browser, vanha_base, "fuel/tst1", autot=skip_talli(), kello=KELLO)
    try:
        s.page.reload(); s.page.wait_for_timeout(400)
        fuels = s.talli()["cars"][0]["fuels"]
        assert len(fuels) == 4 and next(x for x in fuels if x["id"] == "f3").get("skip") is True
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.59: Raportit-tyylinen kooste heti valikoiden ja Uusi tankkaus -painikkeen alla (vanha neljän luvun kortti pois).
def test_kooste(browser, base):
    T = tiedot.tankkaus
    autot = [tiedot.auto(km=151000, fuels=[T("f1", "2026-06-01", 150000, 50.0, 90.0), T("f2", "2026-07-01", 150500, 40.0, 72.0),
                                T("f3", "2026-08-01", 151000, 45.0, 81.0)])]
    s = avaa(browser, base, "fuel/tst1", autot=autot, extra={"ajoura-fuel": '{"p":"12","t":"car"}'}, kello=KELLO)
    try:
        r = s.page.evaluate("""() => {const k = document.querySelector('.fl-sum');
          return {n: document.querySelectorAll('.fl-sum').length, vanha: document.querySelectorAll('.fl-kpis').length,
            ennenHeroa: !!k && !!(k.compareDocumentPosition(document.querySelector('.fl-hero')) & Node.DOCUMENT_POSITION_FOLLOWING),
            addEnnen: !!(document.querySelector('.fl-add').compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING),
            sarakkeet: [...k.querySelectorAll('.rp-kpis > div')].map(d => d.innerText.replace(/\\s+/g, ' ')),
            alarivi: k.querySelector('.fl-foot').innerText.replace(/\\s+/g, ' ')};}""")
        assert r["n"] == 1 and r["vanha"] == 0 and r["ennenHeroa"] and r["addEnnen"], r
        assert len(r["sarakkeet"]) == 3, r
        assert "Polttoainekulut" in r["sarakkeet"][0] and "243 €" in r["sarakkeet"][0] and "3 tankkausta" in r["sarakkeet"][0], r
        assert "/ kk" in r["sarakkeet"][1], r
        assert "Ajetut kilometrit" in r["sarakkeet"][2] and "1 000 km" in r["sarakkeet"][2] and "15,30 €/100 km" in r["sarakkeet"][2]  # (72 + 81) € / 1 000 km; ensimmäinen tankkaus on ajettu ennen jaksoa, r
        assert "135 l" in r["alarivi"] and "Keskihinta 1,800 €/l" in r["alarivi"], r
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.77: epätodennäköinen kulutusväli (Niklaksen kuvassa ~500 l/100 km). Ketju: fuelStats laskee täydestä täyteen
# -välit mittarilukeman mukaan; 50 l vain 10 km:n välillä = 500 l/100 km, kun yhden tankkauksen mittarilukema ei täsmää
# (esim. ikkunan esitäyttämä lukema jäi muuttamatta). Väli yhdistetään seuraavaan (koko matkan litrat / km), tallennettu
# tieto ei muutu, ja tankkaus merkitään "Tarkista mittarilukema".
def poikkeama_talli(viimeinen=False):
    T = tiedot.tankkaus
    f = [T("p1", "2026-10-05", 150000, 40.0, 70.0), T("p2", "2026-10-20", 150010, 50.0, 88.0),
         T("p3", "2026-10-27", 152400, 45.0, 83.0)]
    if viimeinen:  # virheellinen lukema viimeisessä tankkauksessa: seuraavaa väliä ei ole → väli jätetään pois
        f = [T("p1", "2026-09-05", 148000, 40.0, 70.0), T("p2", "2026-10-05", 150000, 160.0, 280.0),
             T("p3", "2026-10-27", 150010, 50.0, 88.0)]
    return [tiedot.auto(name="Testi Pakettiauto", body="panel", km=f[-1]["km"], fuels=f)]


POIKKEAMA_JS = """() => ({iso: document.querySelector('.fl-big')?.innerText.replace(/\\s+/g, ' '),
  huom: document.querySelector('.fl-hero .fl-warn')?.innerText.replace(/\\s+/g, ' ') || '',
  rivit: [...document.querySelectorAll('[data-fl-edit]')].filter(r => r.querySelector('.fl-sus')).map(r => r.dataset.flEdit),
  akseli: Math.max(...[...document.querySelectorAll('.fl-hero .fl-chart text.ax[text-anchor=end]')].map(t => parseFloat(t.textContent.replace(',', '.'))).filter(Number.isFinite))})"""


def test_epatodennakoinen_vali_yhdistetaan(browser, base):
    autot = poikkeama_talli()
    s = avaa(browser, base, "fuel/tst1", autot=autot, extra={"ajoura-fuel": '{"p":"12","t":"car"}'}, kello=KELLO)
    try:
        r = s.page.evaluate(POIKKEAMA_JS)
        assert "4,0" in r["iso"], r  # (50 + 45) l / 2 400 km; ennen 0.77 lokakuun piste 500 l/100 km
        assert "20.10." in r["huom"] and "500" in r["huom"] and "seuraavan kanssa" in r["huom"], r
        assert r["rivit"] == ["p2"] and r["akseli"] < 40, r  # kaavion asteikkoa ei määrää 500
        assert s.talli()["cars"][0]["fuels"][1]["km"] == 150010  # tallennettu tieto ennallaan
        s.page.click("[data-fl-tab=cmp]"); s.page.wait_for_timeout(150)
        assert "korjattu laskennassa" in s.page.inner_text(".screen-content")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_epatodennakoinen_viimeinen_vali_pois(browser, base):
    s = avaa(browser, base, "fuel/tst1", autot=poikkeama_talli(True), extra={"ajoura-fuel": '{"p":"12","t":"car"}'}, kello=KELLO)
    try:
        r = s.page.evaluate(POIKKEAMA_JS)
        assert "8,0" in r["iso"] and "jätetty pois" in r["huom"] and r["rivit"] == ["p3"], r  # 160 l / 2 000 km
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("kieli,teksti", [("fi", "Kulutus olisi 500 l/100 km"), ("en", "Consumption would be 500 l/100 km"),
                                          ("sv", "Förbrukningen skulle vara 500 l/100 km")])
def test_epatodennakoinen_vali_varmistetaan(browser, base, kieli, teksti):
    autot = poikkeama_talli()
    autot[0]["fuels"] = autot[0]["fuels"][:1] + autot[0]["fuels"][2:]  # p1 ja p3: tavallinen väli
    s = avaa(browser, base, "fuel/tst1", autot=autot, kieli=kieli, extra={"ajoura-fuel": '{"p":"12","t":"car"}'}, kello=KELLO)
    f = "#quickfuel-form"
    try:
        s.page.click(".fl-add"); s.page.wait_for_selector(f); ikkuna_valmis(s.page)
        s.page.fill(f + " [name=km]", "152410"); s.page.fill(f + " [name=qty]", "50"); s.page.fill(f + " [name=cost]", "90")
        s.page.click(f + " [type=submit]"); s.page.wait_for_timeout(150)
        assert teksti in s.page.inner_text(f + " [role=alert]").replace(" ", " ")
        assert len(s.talli()["cars"][0]["fuels"]) == 2  # ei vielä tallennettu
        s.page.click(f + " [type=submit]"); s.page.wait_for_selector(f, state="detached")  # Tallenna silti
        assert len(s.talli()["cars"][0]["fuels"]) == 3
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
