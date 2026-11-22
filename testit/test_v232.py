"""2.32 (GPS-suunnitelman vaihe 2d): GPS-kerros Kartalla, vain palvelimen vahvistamalle GPS-oikeudelle.

Auton merkki, tila (Yhdistetty vain tuoreella sijainnilla, muuten "Viimeisin sijainti … sitten"), tunnusluvut,
viimeisin ajo ja reitti alapaneeleineen. Keksitty GPS-palvelu (gps_keksitty.py), kello lukittu 18.11.2026 klo 16.
"""
from apu import avaa
from test_plus import FREE_AI, palvelu
from test_v225 import odota_tila, tyyli
import gps_keksitty as G
import tiedot


def kartalla(browser, base, tila=None, **k):
    s = avaa(browser, base, "home", autot=tiedot.talli(), kello=G.KELLO, **k)
    tila = G.palvelin(s.context, tila)
    palvelu(s, oikeus=FREE_AI)
    s.page.wait_for_selector('.main-tabs a[aria-label="Ajopäiväkirja"]', timeout=8000)
    tyyli(s)
    s.page.locator('.main-tabs a[aria-label="Kartta"]').click()
    odota_tila(s, "ready")
    return s, tila


def test_auto_ja_tunnusluvut(browser, base):
    s, tila = kartalla(browser, base)
    try:
        p = s.page
        p.wait_for_selector(".gps-luvut")
        assert p.locator(".gps-tila-teksti").inner_text() == "Yhdistetty"
        luvut = p.evaluate("[...document.querySelectorAll('.kartta-gps .gps-luvut div')].map(d => d.querySelector('dt').textContent + ': ' + d.querySelector('dd').textContent)")
        assert luvut == ["Viimeisin päivitys: 15.59", "Nopeus: 0 km/h", "Tänään: 156 km", "Kuukausi: 174 km"], luvut
        assert " ".join(p.locator(".gps-viimeisin").inner_text().split()).startswith("Viimeisin ajo · 18.11.2026 Testikunta B → Testikunta A 78 km · 1 h 06 min")
        assert p.locator(".kartta-auto").count() == 1 and p.locator(".kartta-auto.vanha").count() == 0
        # Palvelimelle vain sallitut kyselyt, joissa ei sijaintia.
        assert {q["action"] for q in tila["pyynnot"]} <= {"devices", "position", "trips"}
        assert all(set(q) <= {"action", "device", "from", "to"} for q in tila["pyynnot"])
        # Reitti ja paneeli.
        p.locator("[data-gps-reitti]").click()
        p.wait_for_selector(".gps-merkit")
        teksti = " ".join(p.locator(".kartta-gps").inner_text().split())
        assert "Testikunta B → Testikunta A" in teksti and "Keskinopeus 71 km/h" in teksti and "Luokittelematon" in teksti
        assert p.locator('.kartta-gps a[href^="#ajot/7-"]').count() == 1
        assert any(q["action"] == "route" for q in tila["pyynnot"])
        # Toimintoja, joita ei ole vielä toteutettu (vaihe 3), ei näytetä.
        assert "Merkitse työajoksi" not in teksti and "Tallenna ajopäiväkirjaan" not in teksti
        p.locator("[data-gps-reitti-pois]").click()
        p.wait_for_selector(".gps-luvut")
        # Kortin pienennys muistetaan.
        p.locator("[data-gps-kortti]").click()
        assert p.locator(".gps-luvut").count() == 0 and p.evaluate("localStorage.getItem('ajoura-gps-kortti')") == "kiinni"
        assert not [v for v in s.virheet if "ERR_FAILED" not in v], s.virheet
    finally:
        s.sulje()


def test_vanha_sijainti_ja_virhe(browser, base):
    s, tila = kartalla(browser, base, tila={"ika": 7200})
    try:
        p = s.page
        p.wait_for_selector(".gps-luvut")
        assert p.locator(".gps-tila-teksti").inner_text() == "Viimeisin sijainti 2 h sitten"  # ei "Yhdistetty"
        assert p.locator(".kartta-auto.vanha").count() == 1
        assert "Nopeus: –" in p.evaluate("[...document.querySelectorAll('.kartta-gps .gps-luvut div')].map(d => d.querySelector('dt').textContent + ': ' + d.querySelector('dd').textContent)")
    finally:
        s.sulje()
    s, tila = kartalla(browser, base)
    try:
        p = s.page
        p.wait_for_selector(".gps-luvut")
        tila["virhe"], tila["koodi"] = 502, "traccar_auth"
        p.evaluate("window.dispatchEvent(new Event('ajoura-session'))")
        p.evaluate("document.dispatchEvent(new Event('ajoura-session'))")
        p.locator('.main-tabs a[aria-label="Koti"]').click(); p.wait_for_selector(".secretary-home")
        p.locator('.main-tabs a[aria-label="Kartta"]').click(); odota_tila(s, "ready")
        p.wait_for_selector(".gps-tila-virhe")
        assert "Traccar-tunnus" in p.locator(".gps-tila-teksti").inner_text()
        tila["virhe"] = None
        p.locator("[data-gps-uudelleen]").click()
        p.wait_for_selector(".gps-luvut")
    finally:
        s.sulje()


def test_ei_gps_oikeutta_ei_korttia(browser, base):
    s = avaa(browser, base, "home", autot=tiedot.talli(), kello=G.KELLO)
    tila = G.palvelin(s.context, {"virhe": 403})
    try:
        palvelu(s, oikeus=FREE_AI)
        tyyli(s)
        s.page.locator('.main-tabs a[aria-label="Kartta"]').click()
        odota_tila(s, "ready")
        s.page.wait_for_timeout(800)
        assert s.page.locator(".kartta-gps").is_hidden() and s.page.locator(".kartta-auto").count() == 0
        assert [q["action"] for q in tila["pyynnot"]] == ["devices"]  # vain oikeuden tarkistus
    finally:
        s.sulje()


def test_kapea_ja_paikkalista(browser, base):
    s, _ = kartalla(browser, base, leveys=320, korkeus=568, teema="dark")
    try:
        p = s.page
        p.wait_for_selector(".gps-luvut")
        r = p.evaluate("""() => {const b = s => document.querySelector(s).getBoundingClientRect(), g = b('.kartta-gps'), nav = b('#app-screen > .tab-dock .tab-bar'), z = b('.kartta-zoom');
          return {gAla: g.bottom, navYla: nav.top, zoomAla: z.bottom, gYla: g.top, koko: Math.min(...[...document.querySelectorAll('.kartta-gps dt, .kartta-gps small, .gps-pieni')].map(x => parseFloat(getComputedStyle(x).fontSize)))};}""")
        assert r["gAla"] <= r["navYla"] and r["zoomAla"] <= r["gYla"] and r["koko"] >= 11, r
        assert p.evaluate("document.documentElement.scrollWidth <= innerWidth")
    finally:
        s.sulje()


def test_seloste_kertoo_gps_sta(browser, base):
    s = avaa(browser, base, None, polku="tietosuoja.html", odota=False)
    try:
        s.page.wait_for_load_state("load")
        teksti = " ".join(s.page.inner_text("main").split())
        assert ("Jos tiliisi on liitetty GPS-laite, Kartta ja Ajopäiväkirja hakevat auton sijainnin, ajot ja reitit Traccar-palvelusta "
                "(server.traccar.org) AJOURAn palvelimen (Supabase, EU) kautta vain silloin, kun avaat ne.") in teksti
        assert "Tietoja ei tallenneta AJOURAn palvelimelle eikä laitteellesi" in teksti and "Tilastokeskuksen kuntarajoista (CC BY 4.0)" in teksti
        assert "Traccar (server.traccar.org): GPS-laitteen sijainnit ja ajot, vain tileillä, joihin GPS-laite on liitetty." in teksti
    finally:
        s.sulje()
