"""2.25 (GPS-suunnitelman vaihe 2a): Kartta-välilehti kaikille, uusi alavalikko ja Ajopäiväkirja GPS-oikeudella.

- Alavalikko Koti | Kartta | Raportit | AI (avustaja viimeisenä, sama painike ja toiminta kuin ennen).
- Ajopäiväkirja-välilehti vain, kun palvelin vastaa gps-traccar ?action=devices → 200; 403 piilottaa sen.
  Ilman kirjautumista palvelimelle ei lähetetä mitään, eikä laitteen merkintä yksin näytä välilehteä.
- MapLibre ladataan vasta Kartassa; virhe-, offline- ja valmis-tilat; tumma tila käyttää tummaa tyyliä.
- Ulkoverkko on testeissä estetty: OpenFreeMapin tyyli korvataan keksityllä pienellä tyylillä.
"""
import hashlib
import json
import re
from pathlib import Path

from apu import avaa
from test_plus import FREE_AI, SB, palvelu
import tiedot

JUURI = Path(__file__).resolve().parent.parent
GPS = SB + "/functions/v1/gps-traccar"
TYYLI = json.dumps({"version": 8, "sources": {}, "layers": [{"id": "tausta", "type": "background", "paint": {"background-color": "#a9c8e8"}}]})
LAPSET = 'n=>[...n.children].map(e=>e.matches(".nav-assistant")?"avustaja":e.getAttribute("aria-label"))'


def tyyli(s, pyynnot=None):
    """Keksitty OpenFreeMap: tyyli vastaa, muut karttapalvelun osoitteet estetään."""
    def vastaa(route):
        if pyynnot is not None:
            pyynnot.append(route.request.url)
        route.fulfill(status=200, content_type="application/json", body=TYYLI)
    s.page.route("https://tiles.openfreemap.org/styles/*", vastaa)


def odota_tila(s, tila, aika=15000):
    s.page.wait_for_function("t => window.AjouraKartta && AjouraKartta.state() === t", arg=tila, timeout=aika)


def test_alavalikko_kaikille(browser, base):
    s = avaa(browser, base, "home", autot=tiedot.talli())
    try:
        nav = s.page.locator(".tab-dock>.main-tabs")
        assert nav.evaluate(LAPSET) == ["Koti", "Kartta", "Raportit", "avustaja"]
        assert s.page.locator('.main-tabs a[aria-label="Kartta"]').get_attribute("href") == "#kartta"
        assert s.page.locator('.main-tabs a[aria-label="Koti"]').get_attribute("aria-current") == "page"
        assert s.page.locator(".nav-assistant .tab-label").inner_text() == "AI"
        assert s.page.locator(".nav-assistant [data-home-mic]").get_attribute("aria-label") == "Kirjaa puhumalla"
        # Ilman tekoälyä avustaja kertoo syyn kuten ennen (2.15).
        s.page.locator(".nav-assistant [data-home-mic]").click()
        assert "kirjautumisen" in s.page.locator(".home-voice-feedback").inner_text()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
    s = avaa(browser, base, "home", autot=[])
    try:
        assert s.page.locator(".tab-dock>.main-tabs").evaluate(LAPSET) == ["Koti", "Kartta", "Raportit"]
    finally:
        s.sulje()


def test_kartta_latautuu_vasta_kartassa(browser, base):
    s = avaa(browser, base, "home", autot=tiedot.talli())
    kirjasto = []
    s.page.on("request", lambda r: "maplibre" in r.url and kirjasto.append(r.url))
    esri = []
    s.page.on("request", lambda r: "arcgis" in r.url and esri.append(r.url))
    try:
        s.page.goto(base + "/app.html#reports")
        s.page.wait_for_timeout(500)
        assert kirjasto == [], "MapLibre ladattiin muualla kuin Kartassa"
        assert s.page.evaluate("document.querySelector('link[data-maplibre]')") is None
        tyyli(s)
        s.page.locator('.main-tabs a[aria-label="Kartta"]').click()
        odota_tila(s, "ready")
        assert any(u.endswith("maplibre-gl.mjs") for u in kirjasto)
        assert s.page.locator('.main-tabs a[aria-label="Kartta"]').get_attribute("aria-current") == "page"
        assert s.page.locator(".kartta-map canvas").count() == 1
        assert s.page.locator(".kartta-tila").is_hidden()
        # 2.28: tasopainike näkyy (Esri-avain on käytössä), mutta oletuksena peruskartta eikä yhtään pyyntöä Esrille.
        assert s.page.locator("[data-kartta-tasot]").is_visible()
        assert s.page.evaluate("AjouraKartta.layer()") == "peruskartta"
        s.page.wait_for_timeout(500)
        assert esri == [], "Esrille lähti pyyntö ennen satelliitin valintaa"
        # Lähdemerkintä ja zoomaus toimivat.
        z = s.page.evaluate("()=>document.querySelector('.kartta-map').querySelector('canvas')&&1")
        assert z == 1
        s.page.locator('[data-kartta-zoom="in"]').click()
        s.page.wait_for_timeout(600)
        nakyma = json.loads(s.page.evaluate("localStorage.getItem('ajoura-kartta-nakyma')"))
        assert nakyma["zoom"] > 3.9
        # Uudelleenpiirto (esim. synkronointi) ei luo karttaa uudelleen.
        s.page.evaluate("document.querySelector('.kartta-map canvas').dataset.sama='1'")
        s.page.evaluate("AjouraApp.refresh()")
        assert s.page.locator(".kartta-map canvas[data-sama]").count() == 1
        assert s.page.evaluate("AjouraKartta.state()") == "ready"
        # Poistuttaessa kartta poistetaan (WebGL vapautuu), ja palatessa se luodaan uudelleen.
        s.page.locator('.main-tabs a[aria-label="Koti"]').click()
        s.page.wait_for_selector(".secretary-home")
        assert s.page.evaluate("AjouraKartta.state()") == "idle"
        s.page.locator('.main-tabs a[aria-label="Kartta"]').click()
        odota_tila(s, "ready")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_kartta_ei_latautunut(browser, base):
    # Testin verkko estää OpenFreeMapin: virhetila ja Yritä uudelleen, ei loputonta latausta.
    s = avaa(browser, base, "kartta", autot=tiedot.talli())
    try:
        odota_tila(s, "error")
        tila = s.page.locator(".kartta-tila")
        assert "Karttaa ei voitu ladata" in tila.inner_text()
        assert s.page.locator(".kartta-zoom").is_hidden()
        tyyli(s)
        s.page.locator("[data-kartta-uudelleen]").click()
        odota_tila(s, "ready")
        assert tila.is_hidden()
    finally:
        s.sulje()


def test_kartta_ilman_verkkoa(browser, base):
    s = avaa(browser, base, "home", autot=tiedot.talli())
    try:
        s.context.set_offline(True)
        s.page.locator('.main-tabs a[aria-label="Kartta"]').click()
        odota_tila(s, "offline")
        assert "Ei verkkoyhteyttä" in s.page.locator(".kartta-tila").inner_text()
        assert "Muu AJOURA toimii ilman verkkoa" in s.page.locator(".kartta-tila").inner_text()
        # Muut välilehdet toimivat.
        s.page.locator('.main-tabs a[aria-label="Raportit"]').click()
        s.page.wait_for_selector(".rp-head")
        s.page.locator('.main-tabs a[aria-label="Kartta"]').click()
        odota_tila(s, "offline")
        tyyli(s)
        s.context.set_offline(False)
        odota_tila(s, "ready")
    finally:
        s.sulje()


def test_tumma_tila(browser, base):
    s = avaa(browser, base, "home", autot=tiedot.talli(), teema="dark")
    pyynnot = []
    try:
        tyyli(s, pyynnot)
        s.page.locator('.main-tabs a[aria-label="Kartta"]').click()
        odota_tila(s, "ready")
        assert pyynnot and pyynnot[0].endswith("/styles/dark")
        # Koko näkymä käännetään tummaksi, joten kartta käännetään takaisin (muuten värit vääristyvät).
        assert "invert(1)" in s.page.evaluate("getComputedStyle(document.querySelector('.kartta-map')).filter")
    finally:
        s.sulje()
    s = avaa(browser, base, "home", autot=tiedot.talli())
    pyynnot = []
    try:
        tyyli(s, pyynnot)
        s.page.locator('.main-tabs a[aria-label="Kartta"]').click()
        odota_tila(s, "ready")
        assert pyynnot[0].endswith("/styles/liberty")
        assert s.page.evaluate("getComputedStyle(document.querySelector('.kartta-map')).filter") == "none"
    finally:
        s.sulje()


def gps_palvelin(s, vastaus):
    """Keksitty gps-traccar: vastaus['status'] = seuraava HTTP-tila; pyynnöt talteen."""
    def kasittele(route):
        rq = route.request
        vastaus["pyynnot"].append({"url": rq.url, "auth": rq.headers.get("authorization"), "apikey": rq.headers.get("apikey")})
        route.fulfill(status=vastaus["status"], content_type="application/json",
                      body='{"ok":true,"devices":[]}' if vastaus["status"] == 200 else '{"ok":false,"error":"forbidden"}')
    s.context.route(GPS + "*", kasittele)


def test_ajopaivakirja_vain_palvelimen_luvalla(browser, base):
    # Laitteen merkintä ilman kirjautumista ei näytä välilehteä eikä lähetä mitään.
    s = avaa(browser, base, "home", autot=tiedot.talli(), extra={"ajoura-gps-valilehti": "1"})
    vastaus = {"status": 200, "pyynnot": []}
    try:
        gps_palvelin(s, vastaus)
        s.page.reload(); s.page.wait_for_selector(".secretary-home"); s.page.wait_for_timeout(2000)
        assert s.page.locator('.main-tabs a[aria-label="Ajopäiväkirja"]').count() == 0
        assert vastaus["pyynnot"] == []
        s.page.goto(base + "/app.html#ajot"); s.page.wait_for_timeout(300)
        assert s.page.evaluate("location.hash") == "#kartta"
        assert s.page.evaluate("localStorage.getItem('ajoura-gps-valilehti')") is None
    finally:
        s.sulje()

    # Kirjautunut, palvelin vahvistaa (200): välilehti näkyy Kartan ja Raporttien välissä.
    s = avaa(browser, base, "home", autot=tiedot.talli())
    vastaus = {"status": 200, "pyynnot": []}
    try:
        gps_palvelin(s, vastaus)
        palvelu(s, oikeus=FREE_AI)
        s.page.wait_for_selector('.main-tabs a[aria-label="Ajopäiväkirja"]', timeout=8000)
        assert s.page.locator(".tab-dock>.main-tabs").evaluate(LAPSET) == ["Koti", "Kartta", "Ajopäiväkirja", "Raportit", "avustaja"]
        p = vastaus["pyynnot"][0]
        assert p["url"] == GPS + "?action=devices" and p["auth"] == "Bearer testitunniste" and p["apikey"]
        s.page.locator('.main-tabs a[aria-label="Ajopäiväkirja"]').click()
        # 2.32: oikea Ajopäiväkirja (gps.js); keksityllä palvelimella ei laitteita.
        s.page.wait_for_selector(".gps-virhe")
        assert s.page.locator(".gps-virhe").inner_text() == "Tiliin ei ole liitetty GPS-laitetta."
        assert s.page.locator('.main-tabs a[aria-label="Ajopäiväkirja"]').get_attribute("aria-current") == "page"
        # Uusi tarkistus enintään 10 min välein, ei jokaisella näkymän vaihdolla.
        n = len(vastaus["pyynnot"])
        s.page.locator('.main-tabs a[aria-label="Koti"]').click(); s.page.wait_for_timeout(300)
        assert len(vastaus["pyynnot"]) == n
        # Palvelin peruu oikeuden (403): välilehti katoaa ja #ajot ohjautuu Karttaan.
        vastaus["status"] = 403
        s.page.goto(base + "/app.html#ajot")
        s.page.evaluate("AjouraKartta.checkGps()")
        s.page.wait_for_function("() => location.hash === '#kartta'")
        assert s.page.locator('.main-tabs a[aria-label="Ajopäiväkirja"]').count() == 0
        assert s.page.evaluate("localStorage.getItem('ajoura-gps-valilehti')") is None
        # Palvelinvirhe (500) ei muuta välilehteä kumpaankaan suuntaan.
        vastaus["status"] = 500
        s.page.evaluate("AjouraKartta.checkGps()")
        assert s.page.locator('.main-tabs a[aria-label="Ajopäiväkirja"]').count() == 0
        assert not [v for v in s.virheet if "gps" not in v.lower()], s.virheet
    finally:
        s.sulje()


def test_pyyhkaisy_ja_kartta(browser, base):
    s = avaa(browser, base, "home", autot=tiedot.talli())
    pyyhi = """([sel, dx]) => {const el = document.querySelector(sel), r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2,
      t = (x) => new Touch({identifier: 1, target: el, clientX: x, clientY: y});
      el.dispatchEvent(new TouchEvent('touchstart', {touches: [t(x)], bubbles: true}));
      el.dispatchEvent(new TouchEvent('touchend', {changedTouches: [t(x + dx)], bubbles: true}));}"""
    try:
        tyyli(s)
        s.page.evaluate(pyyhi, [".secretary-home", -120])
        s.page.wait_for_function("() => location.hash === '#kartta'")
        odota_tila(s, "ready")
        # Kartan vetäminen liikuttaa karttaa eikä vaihda välilehteä.
        s.page.evaluate(pyyhi, [".kartta-map", -120])
        s.page.wait_for_timeout(300)
        assert s.page.evaluate("location.hash") == "#kartta"
        s.page.evaluate(pyyhi, [".kartta-yla", -120])  # 2.30: kartan ulkopuolinen kelluva yläosa
        s.page.wait_for_function("() => location.hash === '#reports'")
        s.page.evaluate(pyyhi, [".rp-head", 120])
        s.page.wait_for_function("() => location.hash === '#kartta'")
    finally:
        s.sulje()


def test_kapea_puhelin(browser, base):
    s = avaa(browser, base, "home", autot=tiedot.talli(), leveys=320)
    vastaus = {"status": 200, "pyynnot": []}
    try:
        gps_palvelin(s, vastaus)
        palvelu(s, oikeus=FREE_AI)
        s.page.wait_for_selector('.main-tabs a[aria-label="Ajopäiväkirja"]', timeout=8000)
        tulos = s.page.evaluate("""() => [...document.querySelectorAll('.main-tabs .tab-label')].filter(l => l.offsetParent).map(l => {
          const n = [...l.querySelectorAll('span')].find(x => getComputedStyle(x).display !== 'none') || l, c = n.closest('a,button').getBoundingClientRect();
          return {teksti: n.textContent, koko: parseFloat(getComputedStyle(l).fontSize) * (parseFloat(getComputedStyle(l.closest('.tab-bar')).zoom) || 1),
                  mahtuu: l.scrollWidth <= l.clientWidth + 1, korkeus: c.height, leveys: c.width};})""")
        assert [t["teksti"] for t in tulos] == ["Koti", "Kartta", "Ajot", "Raportit", "AI"]
        for t in tulos:
            assert t["koko"] >= 11 and t["mahtuu"] and t["korkeus"] >= 44, t
        assert s.page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        tyyli(s)
        s.page.locator('.main-tabs a[aria-label="Kartta"]').click()
        odota_tila(s, "ready")
        assert s.page.evaluate("document.querySelector('#app-screen').scrollWidth <= document.querySelector('#app-screen').clientWidth")
        # Valikon ⋯ ei jää yläkulman painikkeiden alle (kuten Raporteissa).
        osuu = "()=>{const m=document.querySelector('.top-menu'),r=m.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('.top-menu')===m}"
        assert s.page.evaluate(osuu)
        s.page.locator('.main-tabs a[aria-label="Ajopäiväkirja"]').click()
        s.page.wait_for_selector(".gps-paivakirja")  # 2.32
        assert s.page.evaluate(osuu)
    finally:
        s.sulje()


def test_offline_osa_ja_kirjasto():
    sw = (JUURI / "sw.js").read_text(encoding="utf-8")
    files = re.search(r"const FILES = \[(.*?)\];", sw, re.S).group(1)
    assert "'kartta.js'" in files and "'kartta.css'" in files
    # 1,6 Mt:n kirjastoa ei asenneta jokaisen päivityksen yhteydessä; se tallentuu ensimmäisellä käytöllä.
    assert "maplibre" not in files
    html = (JUURI / "app.html").read_text(encoding="utf-8")
    assert html.index("sync.js") < html.index("kartta.js") < html.index("app.js")
    kansio = JUURI / "vendor" / "maplibre-gl-6.18.0"
    for rivi in (kansio / "SHA256SUMS").read_text().splitlines():
        summa, nimi = rivi.split()
        assert hashlib.sha256((kansio / nimi).read_bytes()).hexdigest() == summa, nimi
    js = (JUURI / "kartta.js").read_text(encoding="utf-8")
    assert "vendor/maplibre-gl-6.18.0/" in js


def satelliitti(s, base, vastaus):
    """Kartta keksityllä Esrin kuvapalvelulla (2.28: oikea avain kartta.js:ssä). vastaus(route)."""
    pyynnot = []
    s.page.route("https://ibasemaps-api.arcgis.com/**", lambda route: (pyynnot.append(route.request.url), vastaus(route)))
    tyyli(s)
    s.page.goto(base + "/app.html#kartta")
    odota_tila(s, "ready")
    return pyynnot


def png():
    import io
    from PIL import Image
    b = io.BytesIO(); Image.new("RGB", (256, 256), (40, 90, 60)).save(b, format="PNG")
    return b.getvalue()


def valitse_taso(s, nimi):
    s.page.locator("[data-kartta-tasot]").click()
    s.page.locator(f'[data-kartta-taso]:has-text("{nimi}")').click()


def test_satelliitti_vaihtuu_peruskarttaan_jos_ei_lataudu(browser, base):
    s = avaa(browser, base, "home", autot=tiedot.talli())
    try:
        pyynnot = satelliitti(s, base, lambda route: route.fulfill(status=403, body="{}"))
        # Oletuksena peruskartta: Esrille ei lähetetä mitään ennen valintaa.
        assert s.page.evaluate("AjouraKartta.layer()") == "peruskartta"
        nappi = s.page.locator("[data-kartta-tasot]")
        assert nappi.get_attribute("aria-label") == "Karttataso" and nappi.bounding_box()["height"] >= 44
        s.page.wait_for_timeout(500)
        assert pyynnot == []
        valitse_taso(s, "Satelliitti")
        ilmoitus = s.page.locator(".kartta-ilmoitus")
        ilmoitus.wait_for(state="visible", timeout=8000)
        assert ilmoitus.inner_text() == "Satelliittikuva ei latautunut. Näytetään peruskartta."
        avain = re.search(r"const ESRI_KEY = '([^']+)';", (JUURI / "kartta.js").read_text(encoding="utf-8")).group(1)
        assert pyynnot and pyynnot[0].startswith("https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/")
        assert pyynnot[0].endswith("?token=" + avain)
        assert s.page.evaluate("AjouraKartta.layer()") == "peruskartta"
        assert s.page.evaluate("localStorage.getItem('ajoura-kartta-taso')") is None
        s.page.locator("[data-kartta-tasot]").click()
        assert s.page.locator('[data-kartta-taso="peruskartta"]').get_attribute("aria-checked") == "true"
    finally:
        s.sulje()


def test_satelliitti_ilman_verkkoa_ja_toimivana(browser, base):
    # Verkkovirhe (ei vastausta): kolmen epäonnistuneen tiilen jälkeen peruskarttaan.
    s = avaa(browser, base, "home", autot=tiedot.talli())
    try:
        satelliitti(s, base, lambda route: route.abort())
        valitse_taso(s, "Satelliitti")
        s.page.locator(".kartta-ilmoitus").wait_for(state="visible", timeout=8000)
        assert s.page.evaluate("AjouraKartta.layer()") == "peruskartta"
    finally:
        s.sulje()
    # Toimiva satelliitti säilyy valittuna, myös uudelleen avattaessa, ja peruskarttaan voi palata.
    s = avaa(browser, base, "home", autot=tiedot.talli())
    kuva = png()
    try:
        satelliitti(s, base, lambda route: route.fulfill(status=200, content_type="image/png", body=kuva))
        valitse_taso(s, "Satelliitti")
        s.page.wait_for_timeout(1500)
        assert s.page.evaluate("AjouraKartta.layer()") == "satelliitti"
        assert s.page.locator(".kartta-ilmoitus").count() == 0
        s.page.reload(); odota_tila(s, "ready"); s.page.wait_for_timeout(800)
        assert s.page.evaluate("AjouraKartta.layer()") == "satelliitti"
        valitse_taso(s, "Peruskartta")
        assert s.page.evaluate("AjouraKartta.layer()") == "peruskartta"
        assert s.page.evaluate("localStorage.getItem('ajoura-kartta-taso')") is None
    finally:
        s.sulje()
