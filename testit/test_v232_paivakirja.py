"""2.32 (GPS-suunnitelman vaihe 2e): Ajopäiväkirja.

Päivä/Viikko/Kuukausi (oletus kuukausi), jaksojen selaus (ei tulevaisuuteen), kooste, päivittäinen kaavio ja sama
tieto taulukkona, ajolista uusin ensin, kuntanimet laitteessa (Tilastokeskus), päivänäkymässä pysähdykset.
Kaikki ajot ovat luokittelemattomia (luokittelu vaiheessa 3). Ajat Suomen ajassa, myös kesäajan vaihtuessa.
"""
import json
import sys
from pathlib import Path

import pytest

from apu import avaa
from test_plus import FREE_AI, palvelu
import gps_keksitty as G
import tiedot

JUURI = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(JUURI / "tyokalut"))
import kunnat  # noqa: E402


def paivakirja(browser, base, tila=None, **k):
    s = avaa(browser, base, "home", autot=tiedot.talli(), kello=G.KELLO, **k)
    tila = G.palvelin(s.context, tila)
    palvelu(s, oikeus=FREE_AI)
    s.page.wait_for_selector('.main-tabs a[aria-label="Ajopäiväkirja"]', timeout=8000)
    s.page.locator('.main-tabs a[aria-label="Ajopäiväkirja"]').click()
    return s, tila


def luvut(p):
    return p.evaluate("[...document.querySelectorAll('.gps-kooste .gps-luvut div')].map(d => d.querySelector('dt').textContent + ': ' + d.querySelector('dd').textContent)")


def ajot(p):
    return p.evaluate("[...document.querySelectorAll('.gps-ajo')].map(a => [...a.querySelectorAll('small, strong')].map(x => x.textContent))")


def test_kuukausi_viikko_paiva(browser, base):
    s, tila = paivakirja(browser, base)
    try:
        p = s.page
        p.wait_for_selector(".gps-ajo")
        assert p.locator('[data-gps-jakso="kk"]').get_attribute("aria-selected") == "true"
        assert p.locator(".gps-kooste h3").inner_text() == "Marraskuu 2026"
        assert luvut(p) == ["Ajot yhteensä: 174 km", "Ajoja: 3", "Ajoaika: 2 h 34 min"]
        assert ajot(p) == [["18.11.2026 · 14.00–15.06", "Testikunta B → Testikunta A", "78 km · 1 h 06 min · Luokittelematon"],
                           ["18.11.2026 · 12.00–13.06", "Testikunta A → Testikunta B", "78 km · 1 h 06 min · Luokittelematon"],
                           ["16.11.2026 · 16.00–16.22", "Ajo klo 16.00", "18 km · 22 min · Luokittelematon"]]  # paikaton ajo
        assert p.locator(".gps-kaavio svg").get_attribute("aria-label") == "Ajetut kilometrit päivittäin"
        p.locator(".gps-taulukko summary").click()
        rivit = p.evaluate("[...document.querySelectorAll('.gps-taulukko tbody tr')].map(r => r.textContent)")
        assert len(rivit) == 18 and "16.11.18 km" in rivit and "18.11.156 km" in rivit  # ei tulevia päiviä
        # Kuun alun haku Suomen ajassa: 1.11. klo 0 = 31.10. klo 22 UTC.
        kk = [q for q in tila["pyynnot"] if q["action"] == "trips"][-1]
        assert kk["from"] == "2026-10-31T22:00:00Z" and kk["to"] == "2026-11-18T14:00:00Z"
        # Seuraavaa kuukautta ei voi avata; edellinen kyllä.
        assert p.locator('[data-gps-siirra="1"]').is_disabled()
        p.locator('[data-gps-siirra="-1"]').click()
        p.wait_for_function("document.querySelector('.gps-kooste h3').textContent === 'Lokakuu 2026'")
        p.wait_for_selector(".gps-tyhja-jakso")
        # Viikko (ma–su) ja päivä pysähdyksineen.
        p.locator('[data-gps-jakso="vk"]').click()
        p.wait_for_selector(".gps-tyhja-jakso")
        assert p.locator(".gps-kooste h3").inner_text() == "Viikko 28.9.–4.10.2026"  # lokakuun 1. päivän viikko
        while p.locator('[data-gps-siirra="1"]').is_enabled():
            p.locator('[data-gps-siirra="1"]').click(); p.wait_for_timeout(150)
        p.wait_for_selector(".gps-ajo")
        assert p.locator(".gps-kooste h3").inner_text() == "Viikko 16.11.–22.11.2026" and len(ajot(p)) == 3
        p.locator('[data-gps-jakso="pv"]').click()
        p.wait_for_selector(".gps-ajo")
        assert p.locator(".gps-kooste h3").inner_text() == "ke 18.11.2026" and len(ajot(p)) == 2
        assert p.locator(".gps-kaavio").count() == 0
        p.locator("[data-gps-pysahdykset]").click()
        p.wait_for_selector(".gps-pysahdys-lista")
        assert " ".join(p.locator(".gps-pysahdys-lista").inner_text().split()) == "13.06–14.00 Testikunta B 54 min"
        assert not [v for v in s.virheet if "ERR_FAILED" not in v], s.virheet
    finally:
        s.sulje()


def test_ilman_kuntarajoja_osoite_tai_kellonaika(browser, base):
    s, _ = paivakirja(browser, base, tila={"kunnat": {"meta": {"versio": 1}, "kunnat": []}})
    try:
        p = s.page
        p.wait_for_selector(".gps-ajo")
        # Lähtöosoite on, mutta saapumisosoitetta ei: otsikko on kellonaika (ei puolikasta nimeä).
        assert [a[1] for a in ajot(p)] == ["Ajo klo 14.00", "Ajo klo 12.00", "Ajo klo 16.00"]
    finally:
        s.sulje()


def test_virhe_ja_kapea(browser, base):
    s = avaa(browser, base, "home", autot=tiedot.talli(), kello=G.KELLO, leveys=320, korkeus=568)
    tila = G.palvelin(s.context)
    try:
        palvelu(s, oikeus=FREE_AI)
        s.page.wait_for_selector('.main-tabs a[aria-label="Ajopäiväkirja"]', timeout=8000)
        tila["virhe"], tila["koodi"] = 504, "traccar_timeout"
        s.page.locator('.main-tabs a[aria-label="Ajopäiväkirja"]').click()
        p = s.page
        # Oikeus vahvistettiin ennen virhettä (devices), joten näkymä aukeaa ja kertoo virheen.
        p.wait_for_selector(".gps-virhe")
        assert "ei vastannut ajoissa" in p.locator(".gps-virhe").inner_text()
        tila["virhe"] = None
        p.locator("[data-gps-pk-uudelleen]").click()
        p.wait_for_selector(".gps-ajo")
        r = p.evaluate("""() => ({leveys: document.documentElement.scrollWidth <= innerWidth,
          koko: Math.min(...[...document.querySelectorAll('.gps-paivakirja small, .gps-paivakirja dt, .gps-pieni, .gps-jaksot button')].map(x => parseFloat(getComputedStyle(x).fontSize))),
          korkeus: Math.min(...[...document.querySelectorAll('.gps-ajo, .gps-jaksot button, .gps-selaa button')].map(x => x.getBoundingClientRect().height))})""")
        assert r["leveys"] and r["koko"] >= 11 and r["korkeus"] >= 40, r
    finally:
        s.sulje()


def test_suomen_aika_ja_kesaaika(browser, base):
    s = avaa(browser, base, "home", autot=[], kello=G.KELLO)
    try:
        f = lambda js: s.page.evaluate(js)
        assert f("new Date(AjouraGps._testi.keskiyo(2026, 3, 29)).toISOString()") == "2026-03-28T22:00:00.000Z"  # talviaika
        assert f("new Date(AjouraGps._testi.keskiyo(2026, 3, 30)).toISOString()") == "2026-03-29T21:00:00.000Z"  # kesäaika
        assert f("new Date(AjouraGps._testi.keskiyo(2026, 10, 25)).toISOString()") == "2026-10-24T21:00:00.000Z"
        assert f("new Date(AjouraGps._testi.keskiyo(2026, 10, 26)).toISOString()") == "2026-10-25T22:00:00.000Z"
        r = f("(() => { const r = AjouraGps._testi.jaksoRaja('pv', {y: 2026, m: 3, d: 29}); return (r.to - r.from) / 3600000; })()")
        assert r == 23  # kesäajan alkamispäivä
        assert f("AjouraGps._testi.kesto(3960)") == "1 h 06 min" and f("AjouraGps._testi.km(8460)") == "8,5 km" and f("AjouraGps._testi.km(null)") == "–"
    finally:
        s.sulje()


# ---- Kuntarajojen rakennus (tyokalut/kunnat.py) ----
def kunta(nimi, coords, latlon=False):
    c = [[(y, x) if latlon else (x, y) for x, y in coords]]
    return {"type": "Feature", "properties": {"nimi": nimi}, "geometry": {"type": "MultiPolygon", "coordinates": [c]}}


def test_kuntarajat_rakennus(monkeypatch):
    nelio = [(22.5, 62.6), (23.2, 62.6), (23.2, 63.0), (22.5, 63.0), (22.5, 62.6)]
    a = kunnat.rakenna({"features": [kunta("Testikunta A", nelio), kunta("Testikunta B", [(x - 1.2, y + 0.35) for x, y in nelio], latlon=True)]})
    assert [k[0] for k in a] == ["Testikunta A", "Testikunta B"]
    assert a[0][1] == [22.5, 62.6, 23.2, 63.0] and a[1][1] == [21.3, 62.95, 22.0, 63.35]  # akselijärjestys korjattu
    with pytest.raises(SystemExit):
        kunnat.tarkista(a)  # liian vähän kuntia: vanhaa aineistoa ei korvata
    monkeypatch.setattr(kunnat, "MAARA", (2, 3))
    kunnat.tarkista(a)


def test_tyonkulku_ja_aineisto():
    y = (JUURI / ".github" / "workflows" / "kunnat.yml").read_text(encoding="utf-8")
    assert "workflow_dispatch:" in y and "python tyokalut/kunnat.py" in y and "secrets." not in y and "gh pr create --base main" in y
    d = json.loads((JUURI / "kartta-data" / "kunnat.json").read_text(encoding="utf-8"))
    assert d["meta"]["versio"] == 1 and "CC BY 4.0" in d["meta"]["lisenssi"]
    for nimi, bb, polyt in d["kunnat"]:
        assert nimi and 19 <= bb[0] <= bb[2] <= 32 and 59 <= bb[1] <= bb[3] <= 70.5
