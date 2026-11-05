"""Tekoälyavustaja ja Ajoura Plus -valmius (v0.111): Asetukset → Uudet ominaisuudet, käyttäjän oma kytkin (aiEnabled),
palvelimen vahvistama käyttöoikeus (aiEntitled), maksumuuri ja keskitetty tarkistus access.js:ssä.

Taustapalvelua ei vielä ole (access.js: SERVICE tyhjä), joten julkaistussa sovelluksessa kaikki ovat Free-käyttäjiä.
Plus-tilanteet testataan keksityllä palvelimella: testi vaihtaa selaimeen tulevaan access.js:ään testiosoitteet ja
vastaa niihin itse (oikeudet.test ja tekoaly.test). Oikeaa palvelua tai maksua ei käytetä.
"""
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

import tiedot
from apu import KELLO, avaa

JUURI = Path(__file__).resolve().parent.parent
OIKEUDET = "https://oikeudet.test/v1/entitlements"
TEKOALY = "https://tekoaly.test/v1/recognize"
PLUS = {"plan": "plus", "status": "active", "validUntil": "2099-01-01T00:00:00Z",
        "quota": {"ai": {"limit": None, "used": 0, "resetsAt": "2099-01-01T00:00:00Z"}}}
TARKISTA = "f => AjouraAccess.check(f).reason || 'ok'"
TUNNISTA = """f => AjouraAccess.recognize(f, new Blob(['kuitti'], {type: 'image/jpeg'})).then(() => 'ok', e => e.reason)"""


def palvelu(s, oikeus=PLUS, ai_status=200, verkko=True):
    """Keksitty taustapalvelu: oikeudet ja tekoäly. Palauttaa tilan (dict), jota testi voi muuttaa kesken ajon:
    tila['oikeus'] = palvelimen seuraava vastaus, tila['ai'] = tekoälypalvelun pyynnöt."""
    tila = {"oikeus": oikeus, "ai_status": ai_status, "ai": [], "oikeuskyselyt": 0, "verkko": verkko}

    def access(route):
        r = route.fetch()
        body = r.text().replace("const SERVICE = { entitlements: '', ai: '' };",
                                f"const SERVICE = {{ entitlements: '{OIKEUDET}', ai: '{TEKOALY}' }};")
        assert OIKEUDET in body, "access.js:n SERVICE-rivi on muuttunut: päivitä testin korvaus"
        route.fulfill(response=r, body=body)

    def oikeudet(route):
        tila["oikeuskyselyt"] += 1
        if not tila["verkko"]:
            return route.abort()
        route.fulfill(status=200, content_type="application/json", body=json.dumps(tila["oikeus"]))

    def tekoaly(route):
        tila["ai"].append(route.request.headers.get("x-ajoura-feature"))
        route.fulfill(status=tila["ai_status"], content_type="application/json", body='{"km": 123456}')

    s.context.route("**/access.js*", access)
    s.context.route(OIKEUDET, oikeudet)
    s.context.route(TEKOALY, tekoaly)
    s.page.reload()
    s.page.wait_for_selector("#app-screen .screen-content", state="attached")
    s.page.wait_for_function("() => AjouraAccess.status() !== 'checking'")
    s.page.wait_for_timeout(200)
    return tila


def osio(s):
    return s.page.locator(".set-new")


def test_free_nakee_lukitun_tekoalyn_ja_maksumuurin(browser, base):
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO)
    try:
        pg = s.page
        o = osio(s)
        assert o.locator("h3").inner_text() == "Uudet ominaisuudet"
        assert "Tekoälyavustaja" in o.inner_text() and "Kuittien ja huoltokirjojen älykäs tunnistus" in o.inner_text()
        assert o.locator(".plus-tag").inner_text() == "PLUS"
        assert o.locator(".ai-lock svg").count() == 1, "lukituskuvake puuttuu"
        assert o.locator("[data-ai-toggle]").count() == 0, "Free-käyttäjä näkee kytkimen"
        assert pg.evaluate("AjouraAccess.plan()") == "free"
        assert pg.evaluate(TARKISTA, "ai.receipt") == "plan"
        pg.click("[data-plus-open]")
        sheet = pg.locator(".plus-sheet")
        sheet.wait_for()
        assert sheet.locator("h2").inner_text() == "Tekoälyavustaja kuuluu Ajoura Plussaan"
        assert sheet.locator(".plus-lead").inner_text() == \
            "Tunnista tankkauskuitit, kilometrilukemat ja vanhat huoltomerkinnät automaattisesti."
        nappi = sheet.locator("[data-plus-more]")
        assert nappi.inner_text().startswith("Tutustu Ajoura Plussaan")
        assert pg.evaluate("document.activeElement.matches('[data-plus-more]')"), "kohdistus ei siirtynyt ikkunaan"
        assert not sheet.locator(".plus-soon").is_visible()
        nappi.click()
        assert sheet.locator(".plus-soon").is_visible()
        assert "Ajoura Plus on tulossa myöhemmin." in sheet.inner_text() and "Tilausta ei voi vielä ostaa." in sheet.inner_text()
        # Ei toimimatonta ostoa: ei hintaa, ei lomaketta, ei linkkiä maksupalveluun.
        assert "€" not in sheet.inner_text()
        assert sheet.locator("form, input, a[href]").count() == 0
        pg.keyboard.press("Escape")
        assert pg.locator(".sheet-layer").count() == 0
        assert pg.evaluate("document.activeElement.matches('[data-plus-open]')"), "kohdistus ei palannut painikkeeseen"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_ei_verkkoliikennetta_ilman_taustapalvelua(browser, base):
    """Julkaistu versio: palvelua ei ole, joten oikeuksia ei kysytä eikä mitään lähetetä minnekään."""
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO, extra={"ajoura-tekoaly": "1"}, odota=False)
    ulos = []
    s.page.on("request", lambda r: not r.url.startswith(base) and not r.url.startswith("data:") and ulos.append(r.url))
    try:
        s.page.reload()
        s.page.wait_for_selector(".set-new")
        assert s.page.evaluate("[AjouraAccess.status(), AjouraAccess.serviceReady()]") == ["none", False]
        assert s.page.evaluate(TUNNISTA, "ai.receipt") == "plan"
        s.page.wait_for_timeout(300)
        assert not ulos, f"pyyntöjä ulos: {ulos}"
    finally:
        s.sulje()


def test_plus_kayttaja_kytkee_paalle_ja_pois(browser, base):
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO)
    try:
        palvelu(s)
        pg = s.page
        kytkin = pg.locator("[data-ai-toggle]")
        assert kytkin.count() == 1 and osio(s).locator(".ai-lock").count() == 0
        assert pg.evaluate("AjouraAccess.plan()") == "plus"
        # Uudelle käyttäjälle oletus pois.
        assert not kytkin.is_checked() and pg.evaluate("localStorage.getItem('ajoura-tekoaly')") is None
        assert pg.evaluate(TARKISTA, "ai.receipt") == "off"
        assert "pois käytöstä" in osio(s).inner_text()
        # Huoltovälin keskeneräinen muutos ei katoa, kun kytkin päivittää osion.
        pg.fill("input[name=months]", "9")
        pg.click("label.ai-row")
        assert pg.locator("[data-ai-toggle]").is_checked()
        assert pg.evaluate("localStorage.getItem('ajoura-tekoaly')") == "1"
        assert pg.input_value("input[name=months]") == "9"
        for f in ("ai.receipt", "ai.odometer", "ai.servicebook"):
            assert pg.evaluate(TARKISTA, f) == "ok", f
        assert "Tekoälyavustaja on käytössä." in osio(s).inner_text()
        # Näppäimistöllä pois (kohdistus pysyy kytkimessä).
        pg.focus("[data-ai-toggle]")
        pg.keyboard.press("Space")
        assert not pg.locator("[data-ai-toggle]").is_checked()
        assert pg.evaluate("document.activeElement.matches('[data-ai-toggle]')")
        assert pg.evaluate("localStorage.getItem('ajoura-tekoaly')") == "0"
        assert pg.evaluate(TARKISTA, "ai.receipt") == "off"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_valinta_sailyy_uudelleenavauksessa(browser, base):
    """Kirjautuminen on pois käytöstä, joten 'uudelleenkirjautuminen' = sovelluksen sulkeminen ja avaaminen:
    käyttäjän valinta säilyy laitteessa, oikeus haetaan palvelimelta uudelleen."""
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO)
    try:
        tila = palvelu(s)
        s.page.click("label.ai-row")
        kyselyt = tila["oikeuskyselyt"]
        for _ in range(2):
            s.page.goto(s.page.url.split("#")[0] + "#home")
            s.page.wait_for_selector("#app-screen .screen-content", state="attached")
            s.page.goto(s.page.url.split("#")[0] + "#settings")
            s.page.reload()
            s.page.wait_for_selector("[data-ai-toggle]")
            assert s.page.locator("[data-ai-toggle]").is_checked()
            assert s.page.evaluate(TARKISTA, "ai.receipt") == "ok"
        assert tila["oikeuskyselyt"] > kyselyt, "oikeutta ei tarkistettu palvelimelta uudelleen avattaessa"
    finally:
        s.sulje()


@pytest.mark.parametrize("kieli", ["en", "sv"])
def test_plus_tila_kaannetty(browser, base, kieli):
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO, kieli=kieli,
             extra={"ajoura-tekoaly": "0"})
    try:
        palvelu(s, {**PLUS, "quota": {"ai": {"limit": 20, "used": 3, "resetsAt": "2099-01-01T00:00:00Z"}}})
        teksti = osio(s).inner_text()
        for fi in ("Uudet ominaisuudet", "Tekoälyavustaja", "älykäs tunnistus", "pois käytöstä", "jäljellä"):
            assert fi not in teksti, f"{kieli}: kääntämättä '{fi}': {teksti}"
        assert "17 / 20" in teksti
    finally:
        s.sulje()


def test_kiintio_valmius(browser, base):
    """Kuukausikiintiö tulee palvelimelta. Kun se on käytetty, tunnistusta ei tehdä eikä kuvaa lähetetä."""
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO, extra={"ajoura-tekoaly": "1"})
    try:
        tila = palvelu(s, {**PLUS, "quota": {"ai": {"limit": 20, "used": 20, "resetsAt": "2099-01-01T00:00:00Z"}}})
        assert s.page.evaluate("AjouraAccess.quota('ai')")["left"] == 0
        assert s.page.evaluate(TARKISTA, "ai.receipt") == "quota"
        assert s.page.evaluate(TUNNISTA, "ai.receipt") == "quota"
        assert tila["ai"] == []
        assert "0 / 20" in osio(s).inner_text()
        # Virheellinen raja ei avaa rajatonta käyttöä.
        tila["oikeus"] = {**PLUS, "quota": {"ai": {"limit": "paljon", "used": 0}}}
        s.page.evaluate("AjouraAccess.refresh()")
        assert s.page.evaluate(TARKISTA, "ai.receipt") == "quota"
    finally:
        s.sulje()


def test_tekoaly_pois_ei_laheta_kuvia(browser, base):
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO)
    try:
        tila = palvelu(s)
        pg = s.page
        # Plus, mutta tekoäly pois (oletus): ei yhtään pyyntöä tekoälypalveluun millään tunnistuksella.
        for f in ("ai.receipt", "ai.odometer", "ai.servicebook"):
            assert pg.evaluate(TUNNISTA, f) == "off", f
        pg.click("label.ai-row")
        pg.click("label.ai-row")
        assert not pg.locator("[data-ai-toggle]").is_checked()
        assert pg.evaluate(TUNNISTA, "ai.receipt") == "off"
        pg.wait_for_timeout(200)
        assert tila["ai"] == [], f"kuva lähti tekoälylle, vaikka tekoäly on pois: {tila['ai']}"
        # Vastakoe: kun tekoäly on päällä, pyyntö lähtee (testi huomaa lähetyksen).
        pg.click("label.ai-row")
        assert pg.evaluate(TUNNISTA, "ai.odometer") == "ok"
        assert tila["ai"] == ["ai.odometer"]
    finally:
        s.sulje()


def test_tilauksen_paattyminen_estaa(browser, base):
    # Ilman kiinteää kelloa: tilauskauden pitää oikeasti päättyä testin aikana.
    s = avaa(browser, base, "settings", autot=tiedot.talli(), extra={"ajoura-tekoaly": "1"})
    try:
        pg = s.page
        # 1. Tilauskausi päättyy sovelluksen ollessa auki.
        loppu = (datetime.now(timezone.utc) + timedelta(seconds=2.5)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        tila = palvelu(s, {**PLUS, "validUntil": loppu})
        assert pg.evaluate(TARKISTA, "ai.receipt") == "ok"
        pg.wait_for_selector(".set-new .ai-lock", timeout=6000)
        assert pg.locator("[data-ai-toggle]").count() == 0
        assert pg.evaluate(TARKISTA, "ai.receipt") == "plan"
        assert pg.evaluate(TUNNISTA, "ai.receipt") == "plan" and tila["ai"] == []
        # 2. Palvelin kertoo tilauksen päättyneen (esim. peruttu): seuraava tarkistus sulkee.
        tila["oikeus"] = PLUS
        pg.evaluate("AjouraAccess.refresh()")
        pg.wait_for_selector("[data-ai-toggle]")
        tila["oikeus"] = {**PLUS, "status": "canceled"}
        pg.evaluate("AjouraAccess.refresh()")
        pg.wait_for_selector(".set-new .ai-lock")
        assert pg.evaluate(TARKISTA, "ai.receipt") == "plan"
        # 3. Tekoälypalvelu kieltää (402): sovellus lukitsee heti, vaikka sen oma tieto oli vielä Plus.
        tila["oikeus"] = PLUS
        pg.evaluate("AjouraAccess.refresh()")
        pg.wait_for_selector("[data-ai-toggle]")
        tila["ai_status"], tila["oikeus"] = 402, {"plan": "free"}
        assert pg.evaluate(TUNNISTA, "ai.receipt") == "plan"
        pg.wait_for_selector(".set-new .ai-lock")
        assert pg.evaluate("localStorage.getItem('ajoura-tekoaly')") == "1", "käyttäjän oma valinta ei saa kadota"
    finally:
        s.sulje()


def test_selaimen_tietojen_muokkaus_ei_avaa_oikeutta(browser, base):
    vaarennetty = json.dumps(PLUS)
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO, extra={
        "ajoura-tekoaly": "1", "ajoura-plus": "1", "ajoura-plan": "plus", "aiEntitled": "true",
        "ajoura-access": vaarennetty, "ajoura-entitlements": vaarennetty, "ajoura-oikeudet": vaarennetty})
    try:
        pg = s.page
        # Palvelu on olemassa mutta sanoo Free: localStoragen arvot eivät vaikuta.
        tila = palvelu(s, {"plan": "free"})
        assert pg.evaluate("AjouraAccess.plan()") == "free"
        assert osio(s).locator(".ai-lock").count() == 1 and pg.locator("[data-ai-toggle]").count() == 0
        assert pg.evaluate(TUNNISTA, "ai.receipt") == "plan"
        # JavaScript-muuttujat: olio ja sen funktiot ovat lukittuja.
        tulos = pg.evaluate("""() => {
          const yritykset = [
            () => { AjouraAccess.plan = () => 'plus'; },
            () => { AjouraAccess.entitled = () => true; },
            () => { window.AjouraAccess = {plan: () => 'plus', entitled: () => true, check: () => ({ok: true})}; },
            () => { Object.defineProperty(AjouraAccess, 'check', {value: () => ({ok: true})}); },
            () => { delete window.AjouraAccess; },
          ];
          for (const y of yritykset) { try { y(); } catch (e) {} }
          return [AjouraAccess.plan(), AjouraAccess.entitled('ai.receipt'), AjouraAccess.check('ai.receipt').reason];
        }""")
        assert tulos == ["free", False, "plan"], tulos
        assert pg.evaluate(TUNNISTA, "ai.receipt") == "plan"
        assert tila["ai"] == [], "kuva lähti tekoälylle ilman oikeutta"
        # Plus-oikeutta ei tallenneta laitteeseen: kun palvelin ei vastaa, käyttäjä on Free.
        tila["oikeus"] = PLUS
        pg.evaluate("AjouraAccess.refresh()")
        pg.wait_for_selector("[data-ai-toggle]")
        omat = pg.evaluate("Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))")
        uudet = {k: v for k, v in omat.items() if k.startswith("ajoura") and "validUntil" in v and v != vaarennetty}
        assert not uudet, f"oikeus tallentui laitteeseen: {list(uudet)}"
        tila["verkko"] = False
        pg.reload()
        pg.wait_for_function("() => AjouraAccess.status() === 'error'")
        assert pg.evaluate("AjouraAccess.plan()") == "free"
        pg.wait_for_selector(".set-new .ai-lock")
        assert "Plus-tilaa ei voitu tarkistaa" in osio(s).inner_text()
    finally:
        s.sulje()


def test_tuonti_ja_vienti_toimivat_ilman_tekoalya(browser, base, tmp_path):
    """Free-käyttäjä, tekoäly pois: varmuuskopion palautus (tiedostotuonti) ja CSV-vienti Exceliin toimivat.
    Sovelluksessa ei ole Excel- tai CSV-tuontia; tuonti on varmuuskopion palautus."""
    s = avaa(browser, base, "reports", autot=tiedot.talli(), kello=KELLO, mobiili=False, leveys=1280, korkeus=900,
             extra={"ajoura-tekoaly": "1"})
    try:
        assert s.page.evaluate("AjouraAccess.plan()") == "free"
        with s.page.expect_download() as d:
            s.page.click("[data-rp-csv]")
        polku = tmp_path / "kulut.csv"
        d.value.save_as(polku)
        assert len(polku.read_text(encoding="utf-8-sig").splitlines()) > 1
        s.page.goto(s.page.url.split("#")[0] + "#me")
        s.page.set_input_files("input[data-restore]", str(Path(__file__).parent / "aineisto" / "varmuuskopio-0.37.json"))
        s.page.wait_for_function("() => /palautettu|voitu lukea/.test(document.querySelector('#app-screen').innerText)")
        assert "Varmuuskopio palautettu: 0 uutta, 3 päivitetty." in s.page.inner_text("#app-screen")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_poisto_ei_koske_tallennettuihin_tietoihin(browser, base):
    """Tekoälyn kytkeminen pois ei poista kirjauksia: talli on bitilleen sama ennen ja jälkeen."""
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO, extra={"ajoura-tekoaly": "1"})
    try:
        palvelu(s)
        ennen = s.page.evaluate("localStorage.getItem('ajoura-app-v2')")
        s.page.click("label.ai-row")
        assert not s.page.locator("[data-ai-toggle]").is_checked()
        s.page.reload()
        s.page.wait_for_selector("[data-ai-toggle]")
        assert s.page.evaluate("localStorage.getItem('ajoura-app-v2')") == ennen
    finally:
        s.sulje()


def test_plus_tarkistukset_vain_access_js_ssa():
    """Plus-ehtoja ei kirjoiteta muualle: sovellus kysyy oikeuden vain AjouraAccess-rajapinnalta."""
    for nimi in ("app.js", "roles.js", "sync.js", "tutorial.js"):
        koodi = (JUURI / nimi).read_text(encoding="utf-8")
        assert not re.search(r"""['"]plus['"]|\.plan\(\)|aiEntitled|ajoura-tekoaly""", koodi), \
            f"{nimi}: oma Plus-ehto tai asetusavain, käytä AjouraAccess.check/entitled/aiEnabled"
    sw = (JUURI / "sw.js").read_text(encoding="utf-8")
    assert "'access.js'" in sw and 'src="access.js?v=' in (JUURI / "app.html").read_text(encoding="utf-8")


@pytest.mark.parametrize("teema", [None, "dark", "auto", "eko", "blue-track", "premium"])
def test_plus_ulkoasu_teemoissa(browser, base, teema):
    """Kytkin ja maksumuuri jokaisessa teemassa: teksti vähintään 11 px ja kontrasti vähintään 4,5:1."""
    from test_teemat import KONTRASTI
    extra = {"ajoura-ulkoasu": teema} if teema not in (None, "dark") else {}
    if teema == "dark":
        extra["ajoura-theme"] = "dark"
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO, asennettu=True, ios=True, extra=extra)
    try:
        virheet = []

        def mittaa(juuri, kontrasti):
            for x in [] if not kontrasti else s.page.evaluate(KONTRASTI.replace("document.querySelector('#app-screen')", f"document.querySelector('{juuri}')")):
                if x["k"] < (3.0 if x["iso"] else 4.5):
                    virheet.append(f"{teema} {juuri}: '{x['t']}' {x['k']}:1")
            koot = s.page.evaluate(f"""() => [...document.querySelectorAll('{juuri} *')].filter(e => e.childNodes.length
              && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && e.getBoundingClientRect().width)
              .map(e => [e.textContent.trim().slice(0, 30), parseFloat(getComputedStyle(e).fontSize)]).filter(x => x[1] < 11)""")
            virheet.extend(f"{teema} {juuri}: pieni teksti {k}" for k in koot)

        # Tumma tila on käännetty suodattimella, joten laskettu väri ei ole näkyvä väri: siinä vain koot.
        kontrasti = teema != "dark"
        mittaa(".set-new", kontrasti)
        s.page.click("[data-plus-open]")
        s.page.click("[data-plus-more]")
        s.page.wait_for_timeout(400)
        mittaa(".plus-sheet", kontrasti)
        s.page.keyboard.press("Escape")
        palvelu(s)
        mittaa(".set-new", kontrasti)
        s.page.click("label.ai-row")
        mittaa(".set-new", kontrasti)
        assert not s.virheet, s.virheet
        assert not virheet, "; ".join(virheet[:10])
    finally:
        s.sulje()


@pytest.mark.parametrize("kieli", ["fi", "en", "sv"])
def test_maksumuuri_kapealla(browser, base, kieli):
    """320 px: osio ja maksumuuri eivät levitä näkymää eivätkä katkaise painikkeita."""
    from test_leveys import MITTAUS
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO, kieli=kieli, leveys=320, korkeus=640)
    try:
        assert s.page.evaluate(MITTAUS)["yli"] <= 0
        s.page.click("[data-plus-open]")
        s.page.locator(".plus-sheet").wait_for()
        s.page.click("[data-plus-more]")
        laatikot = s.page.evaluate("""() => { const sh = document.querySelector('.plus-sheet').getBoundingClientRect();
          return [...document.querySelectorAll('.plus-sheet *')].map(e => e.getBoundingClientRect())
            .filter(r => r.width && (r.right > sh.right + 0.5 || r.left < sh.left - 0.5)).length; }""")
        assert laatikot == 0, f"{kieli}: maksumuurin sisältö yli reunan"
        palvelu(s)
        assert s.page.evaluate(MITTAUS)["yli"] <= 0, f"{kieli}: Plus-tila levittää näkymän"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
