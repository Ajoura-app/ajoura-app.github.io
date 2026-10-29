"""Offline-osa (sw.js, AJ-16): avaus ilman verkkoa ja heikolla yhteydellä sekä päivitys uuteen versioon.

Muut testit estävät service workerin (offline-osan), joten nämä käyttävät omaa selainkontekstia, jossa se on
sallittu, ja omaa palvelinta, jonka voi kesken testin hidastaa, katkaista tai vaihtaa uuteen versioon.
Palvelin lähettää Cache-Control: no-cache, jotta selaimen oma välimuisti ei sekoita tulosta.

Version yhtenäisyys: testi tekee sovelluksesta kaksi kopiota, A (tämä versio) ja B (sama, versionumerot
nostettuna kuten julkaisussa), ja lisää jokaisen skriptin ja tyylitiedoston loppuun kopion kirjaimen.
Avatun sivun kaikkien tiedostojen pitää olla samaa kopiota, muuten sivu ja skriptit ovat eri versioita.

Laaja testi (merkintä laaja) päivittää oikean edellisen version (AJOURA_VERTAILU, ks. README) tähän versioon.
Testit ajavat Chromiumia; oikean iPhonen testi (lentokonetila) tehdään käsin.
"""
import http.server
import json
import os
import re
import shutil
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit

import pytest

import tiedot
from conftest import JUURI
from test_varmuuskopio import kanoninen

NAKYMA = "#app-screen .screen-content"
SIVUT = ["app.html", "index.html", "tietosuoja.html", "historia.html"]


# --- Tiedostotarkistukset (ilman selainta) -----------------------------------------------------------------

def sw_tiedot(juuri):
    sw = (Path(juuri) / "sw.js").read_text("utf-8")
    versio = re.search(r"const VERSION = '(ak-\d+)';", sw)
    cache = re.search(r"const CACHE = '(ajoura-pwa-\d+)';", sw)
    files = re.search(r"const FILES = \[(.*?)\];", sw, re.S)
    assert versio and cache and files, "sw.js: VERSION, CACHE tai FILES puuttuu"
    return versio.group(1), cache.group(1), re.findall(r"'([^']+)'", files.group(1))


def versioidut(juuri, sivu):
    """Sivun omat tiedostot, joiden osoitteessa on versiotunnus: [(tiedosto, tunnus)]."""
    html = (Path(juuri) / sivu).read_text("utf-8")
    return re.findall(r'(?:src|href)="([\w./-]+)\?v=(ak-\d+)"', html)


def test_sw_numerot_tasmaavat():
    versio, cache, _ = sw_tiedot(JUURI)
    for sivu in SIVUT:
        tunnukset = {t for _, t in versioidut(JUURI, sivu)}
        assert tunnukset == {versio}, f"{sivu}: tunnukset {sorted(tunnukset)}, sw.js:n VERSION {versio}"
    n = int(versio.split("-")[1])
    assert cache == f"ajoura-pwa-{n + 50}", f"sw.js: CACHE {cache}, odotettiin ajoura-pwa-{n + 50} (ak + 50)"


def test_sw_tiedostolista():
    _, _, files = sw_tiedot(JUURI)
    puuttuvat = [f for f in files if f != "./" and not (JUURI / f).is_file()]
    assert not puuttuvat, f"sw.js:n FILES-listan tiedostoja puuttuu (asennus kaatuisi): {puuttuvat}"
    for sivu in SIVUT:
        assert sivu in files, f"{sivu} puuttuu sw.js:n FILES-listalta"
        pois = [f for f, _ in versioidut(JUURI, sivu) if f not in files]
        assert not pois, f"{sivu}: tiedostot puuttuvat sw.js:n FILES-listalta (eivät toimisi ilman verkkoa): {pois}"


# --- Ohjattava palvelin ja sovelluksen kopiot ---------------------------------------------------------------

class Palvelin:
    """Paikallinen palvelin, jonka kansion, viiveet, virheet ja yhteyden voi vaihtaa kesken testin."""

    def __init__(self, juuri):
        self.juuri = Path(juuri)
        self.viive = {}      # polku → sekuntia
        self.virhe = set()   # polut, joihin vastataan 503
        self.katki = False   # True: vastausta ei tule (kuin verkko olisi poikki)
        self.pyynnot = []    # saapuneet pyynnöt
        tila = self

        class Kasittelija(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *a, **k):
                super().__init__(*a, directory=str(tila.juuri), **k)

            def log_message(self, *a):
                pass

            def end_headers(self):
                self.send_header("Cache-Control", "no-cache")
                super().end_headers()

            def do_GET(self):
                polku = urlsplit(self.path).path.lstrip("/")
                tila.pyynnot.append(self.path.lstrip("/"))
                if not tila.katki and polku in tila.virhe:
                    self.send_error(503)
                    return
                if not tila.katki:
                    time.sleep(tila.viive.get(polku, 0))
                if tila.katki:
                    self.close_connection = True
                    return
                # Aina uusi sisältö: kopiot tehdään samalla sekunnilla, joten muokkausaikaan perustuva
                # "ei muuttunut" -vastaus (304) piilottaisi version vaihtumisen.
                del self.headers["If-Modified-Since"]
                del self.headers["If-None-Match"]
                super().do_GET()

        self.s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Kasittelija)
        self.s.daemon_threads = True
        threading.Thread(target=self.s.serve_forever, daemon=True).start()
        self.osoite = f"http://127.0.0.1:{self.s.server_address[1]}"

    def sulje(self):
        self.s.shutdown()
        self.s.server_close()


def merkit(juuri):
    """app.html:n skriptit ja tyylit, joihin kopion kirjain lisätään."""
    return [f for f, _ in versioidut(juuri, "app.html")]


def kopio(lahde, kohde, kirjain):
    shutil.copytree(lahde, kohde, ignore=shutil.ignore_patterns(".git", "testit", "media", "supabase", "__pycache__"))
    for f in merkit(kohde):
        p = kohde / f
        if f.endswith(".js"):
            lisa = f"\n;(window.__ver=window.__ver||{{}})[{json.dumps(f)}]={json.dumps(kirjain)};\n"
        else:
            lisa = f"\n:root{{--testi-{Path(f).stem}:{kirjain}}}\n"
        p.write_text(p.read_text("utf-8") + lisa, "utf-8")
    return kohde


def nosta(kansio):
    """Nostaa version kuten julkaisussa (0.xx + 0.01, ak-N + 1, ajoura-pwa-N + 1); palauttaa uuden numeron."""
    sw = (kansio / "sw.js").read_text("utf-8")
    n = int(re.search(r"VERSION = 'ak-(\d+)'", sw).group(1))
    vanha = re.search(r"appVersion='(\d+\.\d+) \(testiversio\)'", (kansio / "app.js").read_text("utf-8")).group(1)
    uusi = f"{float(vanha) + 0.01:.2f}"
    for f in ["app.js", "index.html", "i18n.js", "i18n-sv.js"]:
        p = kansio / f
        t, c = re.subn(rf"(?<!v){re.escape(vanha)}(?= \(test| /)", uusi, p.read_text("utf-8"))
        assert c, f"{f}: versionumeroa {vanha} ei löytynyt"
        p.write_text(t, "utf-8")
    for f in SIVUT + ["sw.js"]:
        p = kansio / f
        t = p.read_text("utf-8")
        assert f"ak-{n}" in t, f"{f}: ak-{n} puuttuu"
        p.write_text(t.replace(f"ak-{n}", f"ak-{n + 1}"), "utf-8")
    p = kansio / "sw.js"
    p.write_text(p.read_text("utf-8").replace(f"ajoura-pwa-{n + 50}", f"ajoura-pwa-{n + 51}"), "utf-8")
    return uusi


@pytest.fixture(scope="module")
def versiot(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("offline")
    a = kopio(JUURI, tmp / "A", "A")
    b = kopio(JUURI, tmp / "B", "B")
    numero_a = re.search(r"appVersion='(\d+\.\d+)", (a / "app.js").read_text("utf-8")).group(1)
    numero_b = nosta(b)
    return {"A": (a, numero_a, sw_tiedot(a)[1]), "B": (b, numero_b, sw_tiedot(b)[1])}


# --- Selain ---------------------------------------------------------------------------------------------------

class Kayttaja:
    """Selainkonteksti, jossa offline-osa on sallittu (puhelin, englanti, esitäytetty talli)."""

    def __init__(self, browser, palvelin, autot):
        self.p = palvelin
        self.ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                                       device_scale_factor=2, service_workers="allow", reduced_motion="reduce",
                                       timezone_id="Europe/Helsinki", locale="fi-FI")
        ls = {"ajoura-lang": "en", "ajoura-app-v2": tiedot.tila(autot)}
        self.ctx.add_init_script(f"""(() => {{
          if (!localStorage.getItem('__pre')) {{
            for (const [k, v] of Object.entries({json.dumps(ls)})) localStorage.setItem(k, v);
            localStorage.setItem('__pre', '1');
          }}
          sessionStorage.setItem('ajoura-intro', '1');
        }})();""")
        self.page = self.ctx.new_page()
        self.page.set_default_timeout(10_000)
        self.virheet = []
        self.page.on("pageerror", lambda e: self.virheet.append(f"JS-virhe: {e}"))
        self.page.on("console", lambda m: m.type == "error" and not m.text.startswith("Failed to load resource")
                     and self.virheet.append(f"Konsoli: {m.text}"))
        self.n = 0

    def sulje(self):
        self.ctx.close()

    def avaa(self, nakyma="home", aika=30_000):
        """Avaa sovelluksen (koko sivun lataus); palauttaa sekunnit näkymän piirtymiseen."""
        self.n += 1
        alku = time.monotonic()
        self.page.goto(f"{self.p.osoite}/app.html?t={self.n}#{nakyma}", wait_until="commit", timeout=aika)
        self.page.wait_for_selector(NAKYMA, state="attached", timeout=aika)
        kesto = time.monotonic() - alku
        self.page.wait_for_timeout(300)
        return kesto

    def asenna(self):
        """Ensimmäinen avaus ja offline-osan asennus (install.js asentaa sen vain https-osoitteessa)."""
        self.avaa()
        self.page.evaluate("navigator.serviceWorker.register('sw.js')")
        self.page.wait_for_function("navigator.serviceWorker.controller !== null", timeout=30_000)

    def valimuistit(self):
        return self.page.evaluate("caches.keys()")

    def odota_valimuisti(self, nimi, aika=40):
        """Odottaa, että uusi offline-osa on asentunut ja vanha välimuisti poistettu."""
        loppu = time.monotonic() + aika
        while time.monotonic() < loppu:
            if self.valimuistit() == [nimi]:
                return
            time.sleep(0.5)
        raise AssertionError(f"välimuistit {self.valimuistit()}, odotettiin vain {nimi}")

    def versio(self):
        """Avatun sivun tiedostojen kopiot ja Valikon versioteksti."""
        tila = self.page.evaluate("""() => ({
          app: window.AjouraApp && window.AjouraApp.version,
          js: window.__ver || {},
          css: Object.fromEntries(['ajoura', 'app', 'roles'].map(n =>
            [n, getComputedStyle(document.documentElement).getPropertyValue('--testi-' + n).trim()])),
          html: document.querySelector('script[src^="app.js"]').getAttribute('src')})""")
        self.page.evaluate("location.hash = 'menu'")
        self.page.wait_for_selector(".menu-version")
        tila["valikko"] = self.page.inner_text(".menu-version")
        self.page.evaluate("location.hash = 'home'")
        self.page.wait_for_selector(NAKYMA)
        return tila

    def tarkista_versio(self, versiot, kirjain):
        juuri, numero, _ = versiot[kirjain]
        tila = self.versio()
        odotus = {f: kirjain for f in merkit(juuri) if f.endswith(".js")}
        assert tila["js"] == odotus, f"skriptit eri versioita (odotettiin {kirjain}): {tila['js']}"
        assert set(tila["css"].values()) == {kirjain}, f"tyylit eri versioita (odotettiin {kirjain}): {tila['css']}"
        assert tila["html"] == f"app.js?v={sw_tiedot(juuri)[0]}", f"sivu eri versiota (odotettiin {kirjain}): {tila['html']}"
        assert tila["app"] == f"{numero} (testiversio)", tila
        assert tila["valikko"] == f"AJOURA {numero} (test version)", f"Valikko: {tila['valikko']!r}"
        assert not self.virheet, self.virheet

    def talli(self):
        raw = self.page.evaluate("localStorage.getItem('ajoura-app-v2')")
        return kanoninen(json.loads(raw)["cars"])

    def indexeddb(self):
        """IndexedDB:n sisältö (sovellus tallentaa koko tallin sinne) ilman tallennushetkeä (at)."""
        arvot = json.loads(self.page.evaluate("""() => new Promise((ok, no) => {
          const r = indexedDB.open('ajoura', 1);
          r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').getAll();
            q.onsuccess = () => ok(JSON.stringify(q.result)); q.onerror = () => no(q.error); };
          r.onerror = () => no(r.error); })"""))
        assert arvot, "IndexedDB on tyhjä"
        return [kanoninen(a["cars"]) if isinstance(a, dict) and "cars" in a else a for a in arvot] + \
            [{k: v for k, v in a.items() if k not in ("cars", "at")} for a in arvot if isinstance(a, dict)]

    def hae(self, polku):
        """fetch sivulta (kulkee offline-osan kautta): (ok, sekunnit)."""
        return self.page.evaluate("""async p => { const t = performance.now();
          try { const r = await fetch(p, {cache: 'no-cache'}); await r.blob(); return [r.ok, (performance.now() - t) / 1000]; }
          catch (e) { return [false, (performance.now() - t) / 1000]; } }""", polku)


@pytest.fixture()
def asennettu(browser, versiot):
    """Versio A asennettuna puhelimeen esitäytetyllä tallilla."""
    p = Palvelin(versiot["A"][0])
    k = Kayttaja(browser, p, tiedot.talli())
    try:
        k.asenna()
        yield k
    finally:
        k.sulje()
        p.sulje()


# --- Testit ---------------------------------------------------------------------------------------------------

def test_asennus_tallentaa_tiedostot(asennettu, versiot):
    _, _, cache = versiot["A"]
    assert asennettu.valimuistit() == [cache]
    _, _, files = sw_tiedot(versiot["A"][0])
    maara = asennettu.page.evaluate(f"caches.open('{cache}').then(c => c.keys()).then(k => k.length)")
    assert maara >= len(files), f"välimuistissa {maara} tiedostoa, FILES-listalla {len(files)}"
    asennettu.tarkista_versio(versiot, "A")


def test_avaus_ilman_verkkoa(asennettu, versiot):
    k = asennettu
    k.avaa()
    ennen, idb = k.talli(), k.indexeddb()
    assert k.hae("ajoneuvokuvat/boat-open.webp")[0], "kuvan haku verkosta epäonnistui"
    k.p.katki = True
    assert k.avaa() < 5, "avaus ilman verkkoa kesti liian kauan"
    k.tarkista_versio(versiot, "A")
    assert k.talli() == ennen and k.indexeddb() == idb, "tiedot muuttuivat"
    assert k.hae("ajoneuvokuvat/boat-open.webp")[0], "kerran katsottu kuva ei näy ilman verkkoa"
    k.avaa("vehicle/tst1")
    assert "vehicle/tst1" in k.page.url and not k.virheet, k.virheet
    # Sivu, jota ei ole tallennettu, avaa ilman verkkoa sovelluksen.
    k.page.goto(f"{k.p.osoite}/siirto.html", wait_until="commit")
    k.page.wait_for_selector(NAKYMA, state="attached")


def test_hidas_sivu_avautuu_tallennetusta(asennettu, versiot):
    k = asennettu
    k.p.viive["app.html"] = 10
    k.p.pyynnot.clear()
    kesto = k.avaa()
    assert kesto < 5, f"avaus kesti {kesto:.1f} s, vaikka sivu on tallennettu (aikaraja 3 s)"
    k.tarkista_versio(versiot, "A")
    # Saman version skriptit ja tyylit tulevat puhelimesta: verkosta haetaan vain sivu (ja kuvat, features.json).
    verkosta = [r for r in k.p.pyynnot if re.match(r"[\w./-]+\.(js|css)\?v=", r)]
    assert not verkosta, f"skriptejä haettiin verkosta, vaikka ne ovat puhelimessa: {verkosta}"


def test_hidas_tiedosto(asennettu):
    k = asennettu
    k.p.viive["features.json"] = 10
    ok, s = k.hae("features.json")
    assert ok and s < 5, f"tallennettu features.json: ok={ok}, {s:.1f} s"
    # Kuva, jota ei ole vielä tallennettu, odottaa verkkoa eikä katkea aikarajaan.
    k.p.viive["ajoneuvokuvat/sled-mountain.webp"] = 4
    ok, s = k.hae("ajoneuvokuvat/sled-mountain.webp")
    assert ok and s >= 3.9, f"tallentamaton kuva: ok={ok}, {s:.1f} s"


def test_palvelinvirhe(asennettu, versiot):
    k = asennettu
    k.p.virhe.add("app.html")
    assert k.avaa() < 5
    k.tarkista_versio(versiot, "A")


def test_paivitys_uuteen_versioon(browser, versiot):
    """Julkaisu hyvällä yhteydellä: uusi versio näkyy heti kokonaisena, ja tiedot säilyvät."""
    p = Palvelin(versiot["A"][0])
    k = Kayttaja(browser, p, tiedot.talli())
    try:
        k.asenna()
        k.avaa()
        ennen, idb = k.talli(), k.indexeddb()
        p.juuri = versiot["B"][0]  # julkaisu
        k.avaa()
        k.tarkista_versio(versiot, "B")
        k.page.evaluate("navigator.serviceWorker.getRegistration().then(r => r.update())")
        k.odota_valimuisti(versiot["B"][2])
        p.katki = True
        k.avaa()
        k.tarkista_versio(versiot, "B")
        assert k.talli() == ennen and k.indexeddb() == idb, "tiedot muuttuivat päivityksessä"
    finally:
        k.sulje()
        p.sulje()


def test_paivitys_heikolla_yhteydella(browser, versiot):
    """Julkaisu heikolla yhteydellä: ensin edellinen versio kokonaisena, asennuksen jälkeen uusi kokonaisena."""
    p = Palvelin(versiot["A"][0])
    k = Kayttaja(browser, p, tiedot.talli())
    try:
        k.asenna()
        ennen = k.talli()
        p.juuri = versiot["B"][0]
        p.viive["app.html"] = 10
        assert k.avaa() < 5
        k.tarkista_versio(versiot, "A")
        k.page.evaluate("navigator.serviceWorker.getRegistration().then(r => r.update())")
        k.odota_valimuisti(versiot["B"][2])
        assert k.avaa() < 5
        k.tarkista_versio(versiot, "B")
        assert k.talli() == ennen
    finally:
        k.sulje()
        p.sulje()


def test_myohassa_tullut_sivu_ei_sekoita(browser, versiot):
    """Julkaisu heikolla yhteydellä ja verkko katki ennen kuin uusi offline-osa ehtii asentua: myöhässä tullutta
    uutta sivua ei tallenneta vanhojen tiedostojen rinnalle, joten seuraava avaus on yhä kokonaan edellistä versiota."""
    p = Palvelin(versiot["A"][0])
    k = Kayttaja(browser, p, tiedot.talli())
    try:
        k.asenna()
        p.juuri = versiot["B"][0]
        p.virhe.add("sw.js")  # uusi offline-osa ei asennu
        p.viive["app.html"] = 4
        assert k.avaa() < 4
        k.tarkista_versio(versiot, "A")
        k.page.wait_for_timeout(2500)  # myöhässä tullut sivu on saapunut
        p.katki = True
        k.avaa()
        k.tarkista_versio(versiot, "A")
        assert k.valimuistit() == [versiot["A"][2]]
    finally:
        k.sulje()
        p.sulje()


@pytest.mark.laaja
def test_laaja_paivitys_edellisesta(browser):
    """Oikea edellinen versio (vanha sw.js) → tämä versio: uusi näkyy, uusi offline-osa asentuu, tiedot säilyvät."""
    kansio = os.environ.get("AJOURA_VERTAILU")
    if not kansio or not (Path(kansio) / "app.html").is_file():
        pytest.skip("AJOURA_VERTAILU puuttuu: anna edellisen version kansio (ks. testit/README.md)")
    versio, cache, _ = sw_tiedot(JUURI)
    numero = re.search(r"appVersion='(\d+\.\d+)", (JUURI / "app.js").read_text("utf-8")).group(1)
    p = Palvelin(Path(kansio).resolve())
    k = Kayttaja(browser, p, tiedot.talli())
    try:
        k.asenna()
        vanha_cache = k.valimuistit()
        assert vanha_cache and vanha_cache != [cache], f"edellisen version välimuisti: {vanha_cache}"
        k.avaa()
        ennen, idb = k.talli(), k.indexeddb()
        p.juuri = JUURI
        k.avaa()
        assert k.page.evaluate("window.AjouraApp.version") == f"{numero} (testiversio)"
        k.page.evaluate("navigator.serviceWorker.getRegistration().then(r => r.update())")
        k.odota_valimuisti(cache)
        p.katki = True
        k.avaa()
        assert k.page.evaluate("window.AjouraApp.version") == f"{numero} (testiversio)"
        assert k.page.evaluate("document.querySelector('script[src^=\"app.js\"]').getAttribute('src')") == f"app.js?v={versio}"
        assert k.talli() == ennen and k.indexeddb() == idb, "tiedot muuttuivat päivityksessä"
        assert not k.virheet, k.virheet
    finally:
        k.sulje()
        p.sulje()
