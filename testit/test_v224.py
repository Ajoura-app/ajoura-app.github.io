"""2.24 (Niklas): tankkaukseen "Älä huomioi kustannuksissa" (nocost). Esim. joku muu maksoi polttoaineen: summa näkyy
kirjauksessa, mutta sitä ei lasketa kulusummiin (tankkauskirja, Raportit, ajoneuvosivu, huoltohistoria). Litrahinta ja
kulutus lasketaan yhä, koska ne ovat oikeita lukuja maksajasta riippumatta. Vanhemmat versiot ohittavat kentän."""
import json

import tiedot
from apu import KELLO, avaa, ikkuna_valmis
from test_varmuuskopio import VANHA, palauta, tallenna_ladaten

F = "#quickfuel-form"
PREFS = {"ajoura-fuel": '{"p":"12","t":"car"}'}


def talli():
    T = tiedot.tankkaus
    return [tiedot.auto(km=151500, fuels=[T("f1", "2026-06-01", 150000, 50.0, 90.0), T("f2", "2026-07-01", 150500, 40.0, 72.0),
                                         T("f3", "2026-08-01", 151000, 50.0, 90.0, nocost=True),  # joku muu maksoi
                                         T("f4", "2026-09-01", 151500, 40.0, 72.0)])]


def fills(s):
    return {f["id"]: f for f in s.talli()["cars"][0]["fuels"]}


def teksti(p, sel):
    return p.locator(sel).first.inner_text().replace("\xa0", " ")


def test_kulut_ilman_merkittya_hinta_ja_kulutus_ennallaan(browser, base):
    s = avaa(browser, base, "fuel/tst1", autot=talli(), extra=PREFS, kello=KELLO)
    try:
        p = s.page
        kortit = p.evaluate("[...document.querySelectorAll('.fv-card')].map(d => d.innerText.replace(/\\s+/g, ' '))")
        assert "1,800 €/l" in kortit[1], kortit          # keskihinta kaikista hinnoista: 324 € / 180 l
        assert "234 €" in kortit[2], kortit              # kulut 90 + 72 + 72, ilman f3:a
        assert "4 / 180 l" in kortit[3], kortit          # määrät ja litrat yhä mukana
        assert "8,7" in p.inner_text(".fl-big")         # kulutus ennallaan: (40 + 50 + 40) l / 1 500 km
        rivi = teksti(p, "[data-fl-edit='f3']")
        assert "ei kuluihin" in rivi and "90,00 €" in rivi and "1,800 €/l" in rivi, rivi
        elo = p.locator("details.fv-g", has_text="Elokuu")
        assert "0,00 €" in teksti(elo, "summary"), teksti(elo, "summary")
        p.evaluate('location.hash="#reports"'); p.wait_for_selector("[data-fw=fuel]")
        assert "234" in teksti(p, "[data-fw=fuel]") and "324" not in teksti(p, "[data-fw=fuel]")
        assert "234" in teksti(p, "[data-fw=tot]")
        p.evaluate('location.hash="#vehicle/tst1"'); p.wait_for_selector(".fuel-cost")
        assert "234 €" in teksti(p, ".fuel-cost")
        p.evaluate('location.hash="#report/tst1"'); p.wait_for_selector(".report-facts")
        assert "234 €" in teksti(p, ".report-facts")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_valinta_tallentuu_ja_poistuu(browser, base):
    s = avaa(browser, base, "fuel/tst1", autot=talli(), extra=PREFS, kello=KELLO)
    try:
        p = s.page
        # Muokkaus: merkintä näkyy valittuna, poisto palauttaa summan kuluihin.
        p.click("[data-fl-edit='f3']"); p.wait_for_selector(F + "[data-edit]")
        assert p.is_checked(F + " [name=nocost]") and not p.is_checked(F + " [name=skip]")
        assert "Älä huomioi kustannuksissa" in p.inner_text(F)
        p.uncheck(F + " [name=nocost]"); p.click(F + " [type=submit]"); p.wait_for_selector(F, state="detached")
        f3 = fills(s)["f3"]
        assert "nocost" not in f3 and f3["cost"] == 90
        assert "324 €" in p.evaluate("document.querySelectorAll('.fv-card')[2].innerText")
        # Uusi tankkaus merkinnällä: tallentuu nocost: true, summa säilyy kirjauksessa.
        p.click(".fl-add"); p.wait_for_selector(F); ikkuna_valmis(p)
        p.fill(F + " [name=km]", "152000"); p.fill(F + " [name=qty]", "50"); p.fill(F + " [name=cost]", "100")
        p.check(F + " [name=nocost]"); p.click(F + " [type=submit]"); p.wait_for_selector(F, state="detached")
        uusi = next(f for f in fills(s).values() if f["km"] == 152000)
        assert uusi["nocost"] is True and uusi["cost"] == 100 and uusi["qty"] == 50
        assert "324 €" in p.evaluate("document.querySelectorAll('.fv-card')[2].innerText")
        # Ilman summaa merkintää ei tallenneta (siinä ei ole mitään jätettävää pois).
        p.click(".fl-add"); p.wait_for_selector(F); ikkuna_valmis(p)
        p.fill(F + " [name=km]", "152500"); p.fill(F + " [name=qty]", "30")
        p.check(F + " [name=nocost]"); p.click(F + " [type=submit]"); p.wait_for_selector(F, state="detached")
        ilman = next(f for f in fills(s).values() if f["km"] == 152500)
        assert ilman["cost"] is None and "nocost" not in ilman
        # Säilyy uudelleenlatauksessa.
        p.reload(); p.wait_for_selector(".fl-big")
        assert fills(s)[uusi["id"]]["nocost"] is True
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_raporttien_tapahtumalista_kertoo_merkinnan(browser, base):
    s = avaa(browser, base, "reports", autot=talli(), kello=KELLO)
    try:
        p = s.page
        p.wait_for_selector(".rx-list")
        rivi = p.locator(".rx-item", has_text="1.8.2026")
        assert "90,00 €" in teksti(rivi, ".rx-eur")
        rivi.locator(".rx-row").click()
        assert "Ei mukana kustannuksissa" in teksti(rivi, ".rx-panel")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_varmuuskopio_ja_vanha_varmuuskopio(browser, base, tmp_path):
    s = avaa(browser, base, "me", autot=talli(), mobiili=False, leveys=1280, korkeus=900, kello=KELLO)
    try:
        polku = tallenna_ladaten(s, tmp_path)
        data = json.loads(polku.read_text("utf-8"))
        assert {f["id"]: f.get("nocost") for f in data["cars"][0]["fuels"]} == {"f1": None, "f2": None, "f3": True, "f4": None}
    finally:
        s.sulje()
    s = avaa(browser, base, "me", autot=None, mobiili=False, leveys=1280, korkeus=900, kello=KELLO)
    try:
        assert "palautettu" in palauta(s, polku)
        assert fills(s)["f3"]["nocost"] is True
    finally:
        s.sulje()
    # Vanhan version (0.37) varmuuskopio palautuu ilman kenttää; kulut lasketaan kuten ennen.
    s = avaa(browser, base, "me", autot=None, mobiili=False, leveys=1280, korkeus=900, kello=KELLO)
    try:
        assert "palautettu" in palauta(s, VANHA)
        assert all("nocost" not in f for c in s.talli()["cars"] for f in c.get("fuels", []))
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_viallinen_arvo_hylataan(browser, base):
    autot = talli()
    autot[0]["fuels"][2]["nocost"] = "kyllä"
    s = avaa(browser, base, "fuel/tst1", autot=autot, extra=PREFS, kello=KELLO)
    try:
        # Kuten 2.23:n öljyväli: viallinen valinnainen kenttä poistetaan latauksessa, ajoneuvo ja tankkaus säilyvät.
        nakyvat = s.page.evaluate("[...document.querySelectorAll('[data-fl-edit]')].map(b => b.dataset.flEdit).sort()")
        assert nakyvat == ["f1", "f2", "f3", "f4"], nakyvat
        assert "324 €" in s.page.evaluate("document.querySelectorAll('.fv-card')[2].innerText")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
