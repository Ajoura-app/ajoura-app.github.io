"""6. Haitallinen syöte (AJ-08): käyttäjän teksti ei saa koskaan muuttua koodiksi.

HTML-koodi ajoneuvon nimessä, merkinnän lisätiedossa, yrityksen nimessä, varaosassa ja muistiinpanossa
pitää näkyä tekstinä kaikissa näkymissä, ostajan linkissä (historia.html) ja CSV:ssä kaavat neutraloituina.
"""
import tiedot
from apu import KELLO, avaa

H = '<img src=x onerror="window.__xss=1">'
H2 = '"><svg onload="window.__xss=2">'
KAAVA = '=HYPERLINK("http://esim.invalid","klikkaa")'


def talli():
    a = tiedot.auto(name="Skoda " + H, nick=H2[:24], events=[
        tiedot.merkinta("e1", "Huolto", "2026-03-14", 148900, cost="289", note=H,
                        items=["Moottoriöljy"], by={"t": "shop", "n": H, "tel": H2[:30]},
                        parts=[{"name": H, "qty": "1", "price": "10"}]),
        tiedot.merkinta("e2", "Korjaus ja osan vaihto", "2026-06-02", 150900, cost="412", note=KAAVA),
    ], fuels=[tiedot.tankkaus("f1", "2026-07-01", 151000, 50.0, 85.0, grade=H[:24])],
        memos=[{"id": "m1", "date": "2026-05-01", "title": H[:80], "text": H}])
    return [a]


NAKYMAT = ["home", "vehicle/tst1", "event/tst1/e1", "edit/tst1/e1", "report/tst1", "notes/tst1",
           "reports", "fuel/tst1", "owner/tst1", "caredit/tst1", "tips"]


def ei_koodia(s, missa):
    pg = s.page
    assert pg.evaluate("window.__xss") is None, f"{missa}: käyttäjän teksti suoritettiin koodina"
    n = pg.evaluate("document.querySelectorAll('img[src=\"x\"], svg[onload], [onerror]').length")
    assert n == 0, f"{missa}: käyttäjän tekstistä syntyi {n} HTML-elementtiä"


def test_nakymat_nayttavat_tekstina(browser, base):
    s = avaa(browser, base, "home", autot=talli(), kello=KELLO)
    try:
        for v in NAKYMAT:
            s.page.goto(base + "/app.html#" + v)
            s.page.wait_for_timeout(300)
            ei_koodia(s, "#" + v)
            if v in ("vehicle/tst1", "event/tst1/e1", "notes/tst1"):
                assert "onerror" in s.page.inner_text("#app-screen"), f"#{v}: teksti ei näy tekstinä"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_ostajan_linkki(browser, base):
    s = avaa(browser, base, "report/tst1", autot=talli(), kello=KELLO, mobiili=False, leveys=1280,
             korkeus=900, leike=True)
    try:
        s.page.click("[data-sale]")
        s.page.wait_for_function("() => window.__clip")
        linkki = s.page.evaluate("window.__clip")
        assert "/historia.html#" in linkki
        h = s.context.new_page()
        h.goto(linkki)
        h.wait_for_timeout(500)
        assert h.evaluate("window.__xss") is None, "historia.html suoritti käyttäjän tekstin koodina"
        assert h.evaluate("document.querySelectorAll('img[src=\"x\"], svg[onload], [onerror]').length") == 0
        assert "onerror" in h.inner_text("body"), "lisätieto ei näy ostajan sivulla tekstinä"
    finally:
        s.sulje()


def test_csv_kaavasuoja(browser, base, tmp_path):
    s = avaa(browser, base, "reports", autot=talli(), kello=KELLO, mobiili=False, leveys=1280, korkeus=900)
    try:
        with s.page.expect_download() as d:
            s.page.click("[data-rp-csv]")
        polku = tmp_path / "kulut.csv"
        d.value.save_as(polku)
        raaka = polku.read_bytes()
        assert raaka.startswith(b"\xef\xbb\xbf"), "CSV:stä puuttuu BOM (ä ja ö näkyisivät Excelissä väärin)"
        teksti = raaka.decode("utf-8-sig")
        rivi = next(r for r in teksti.splitlines() if "HYPERLINK" in r)
        solu = next(x for x in rivi.split(";") if "HYPERLINK" in x)
        assert solu.lstrip('"').startswith("'="), f"kaavaa ei neutraloitu: {solu}"
    finally:
        s.sulje()
