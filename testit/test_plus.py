"""Tekoälyavustaja ja Ajoura Plus (v0.111–0.112): Asetukset → Uudet ominaisuudet, käyttäjän oma kytkin (aiEnabled),
palvelimen vahvistama käyttöoikeus (aiEntitled), maksumuuri, keskitetty tarkistus access.js:ssä ja tiimin
testikirjautuminen (Supabase Auth, sähköpostikoodi).

Julkaistussa sovelluksessa kirjautuminen on vain tiimin laitteilla, joten muut ovat Free-käyttäjiä eikä sovellus ota
yhteyttä palvelimeen. Plus-tilanteet testataan keksityllä palvelimella: testi antaa selaimeen tulevalle access.js:lle
testiavaimen ja vastaa Supabase-projektin osoitteisiin itse. Oikeaa palvelua, tiliä tai maksua ei käytetä.
"""
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

import tiedot
from apu import KELLO, avaa

JUURI = Path(__file__).resolve().parent.parent
SB = "https://sjamwwcqrwspwvilurqn.supabase.co"
OIKEUDET = SB + "/rest/v1/rpc/get_entitlement"
TEKOALY = SB + "/functions/v1/tekoaly"
AVAIN = "sb_publishable_testi"
TUNNISTE = "testitunniste"
ISTUNTO = json.dumps({"access_token": TUNNISTE, "refresh_token": "uusinta-1", "expires_at": 4102444800000,
                      "user": {"id": "u-1", "email": "testi@esimerkki.test"}})
TIIMI = json.dumps({"features": {"account": True}})
PLUS = {"plan": "plus", "status": "active", "validUntil": "2099-01-01T00:00:00Z",
        "quota": {"ai": {"limit": None, "used": 0, "resetsAt": "2099-01-01T00:00:00Z"}}}
TARKISTA = "f => AjouraAccess.check(f).reason || 'ok'"
TUNNISTA = """f => AjouraAccess.recognize(f, new Blob(['kuitti'], {type: 'image/jpeg'})).then(() => 'ok', e => e.reason)"""


def palvelu(s, oikeus=PLUS, ai_status=200, verkko=True, kirjautunut=True):
    """Keksitty Supabase: oikeudet, tekoälyfunktio ja kirjautuminen. Palauttaa tilan (dict), jota testi voi muuttaa
    kesken ajon: tila['oikeus'] = palvelimen seuraava vastaus, tila['ai'] = tekoälyfunktion pyynnöt,
    tila['auth'] = kirjautumispyynnöt. Palvelin hyväksyy vain oikean julkisen avaimen ja istuntotunnisteen."""
    tila = {"oikeus": oikeus, "ai_status": ai_status, "ai": [], "oikeuskyselyt": 0, "verkko": verkko, "auth": [],
            "uusinta_ok": True, "ai_vastaus": {"km": 123456}, "ai_pyynnot": []}

    def access(route):
        r = route.fetch()
        body, n = re.subn(r"(const SUPABASE = \{ url: '([^']+)', key: )'[^']*'", rf"\1'{AVAIN}'", r.text(), count=1)
        assert n == 1 and SB in body, "access.js:n SUPABASE-rivi on muuttunut: päivitä testin korvaus"
        route.fulfill(response=r, body=body)

    def tunnistettu(route):
        h = route.request.headers
        return h.get("authorization") == f"Bearer {TUNNISTE}" and h.get("apikey") == AVAIN

    def oikeudet(route):
        tila["oikeuskyselyt"] += 1
        if not tila["verkko"]:
            return route.abort()
        if not tunnistettu(route):
            return route.fulfill(status=401, content_type="application/json", body='{"message":"JWT"}')
        route.fulfill(status=200, content_type="application/json", body=json.dumps(tila["oikeus"]))

    def tekoaly(route):
        if not tunnistettu(route):
            return route.fulfill(status=401, body="{}")
        tila["ai"].append(route.request.headers.get("x-ajoura-feature"))
        tila["ai_pyynnot"].append({"tyyppi": route.request.headers.get("content-type"), "koko": len(route.request.post_data_buffer or b"")})
        route.fulfill(status=tila["ai_status"], content_type="application/json", body=json.dumps(tila["ai_vastaus"]))

    def auth(route):
        rq = route.request
        polku = rq.url[len(SB + "/auth/v1/"):]
        runko = json.loads(rq.post_data or "{}")
        tila["auth"].append((polku.split("?")[0], runko, rq.headers.get("apikey")))
        istunto = {"access_token": TUNNISTE, "refresh_token": "uusinta-2", "expires_in": 3600,
                   "user": {"id": "u-1", "email": runko.get("email", "testi@esimerkki.test")}}
        if polku.startswith("otp"):
            return route.fulfill(status=200, content_type="application/json", body="{}")
        if polku.startswith("verify"):
            ok = runko.get("token") == "123456" or runko.get("token_hash") == "linkkitunniste"
            return route.fulfill(status=200 if ok else 403, content_type="application/json",
                                 body=json.dumps(istunto if ok else {"error_code": "otp_expired"}))
        if polku.startswith("token"):
            return route.fulfill(status=200 if tila["uusinta_ok"] else 400, content_type="application/json",
                                 body=json.dumps(istunto if tila["uusinta_ok"] else {"error_code": "refresh_token_not_found"}))
        route.fulfill(status=204, body="")

    s.context.route("**/access.js*", access)
    s.context.route(OIKEUDET, oikeudet)
    s.context.route(TEKOALY, tekoaly)
    s.context.route(SB + "/auth/v1/**", auth)
    if kirjautunut:
        s.page.evaluate("t => localStorage.setItem('ajoura-tili', t)", ISTUNTO)
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
        # Kohdistus siirtyy seuraavassa ruudunpäivityksessä (requestAnimationFrame): odotetaan, ei tarkisteta heti.
        pg.wait_for_function("() => document.activeElement && document.activeElement.matches('[data-plus-more]')", timeout=3000)
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


def test_ei_verkkoliikennetta_ilman_kirjautumista(browser, base):
    """Julkaistu versio sellaisenaan (oikea avain, ei testipalvelinta): kirjautumaton käyttäjä ei ota yhteyttä
    mihinkään, oikeuksia ei kysytä eikä mitään lähetetä."""
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO, extra={"ajoura-tekoaly": "1"}, odota=False)
    ulos = []
    s.page.on("request", lambda r: not r.url.startswith(base) and not r.url.startswith("data:") and ulos.append(r.url))
    try:
        s.page.reload()
        s.page.wait_for_selector(".set-new")
        assert s.page.evaluate("[AjouraAccess.status(), AjouraAccess.serviceReady(), AjouraAccess.account()]") == ["none", True, None]
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


def test_ilman_kirjautumista_ei_yhteytta_palvelimeen(browser, base):
    """Palvelu kytketty, mutta käyttäjä ei ole kirjautunut (kaikki julkiset käyttäjät): ei yhtään pyyntöä Supabaseen,
    eikä kirjautumista näytetä ilman tiimin kytkintä."""
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO, extra={"ajoura-tekoaly": "1"})
    ulos = []
    s.page.on("request", lambda r: r.url.startswith(SB) and ulos.append(r.url))
    try:
        tila = palvelu(s, kirjautunut=False)
        assert s.page.evaluate("[AjouraAccess.serviceReady(), AjouraAccess.status(), AjouraAccess.plan()]") == [True, "none", "free"]
        assert s.page.evaluate(TUNNISTA, "ai.receipt") == "plan"
        assert s.page.locator("#ai-login, .ai-acct").count() == 0, "kirjautuminen näkyy ilman tiimin kytkintä"
        s.page.wait_for_timeout(300)
        assert not ulos and tila["oikeuskyselyt"] == 0 and not tila["auth"], f"pyyntöjä Supabaseen: {ulos}"
    finally:
        s.sulje()


def test_tiimin_kirjautuminen_koodilla(browser, base):
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO, extra={"ajoura-features-local": TIIMI})
    try:
        tila = palvelu(s, kirjautunut=False)
        pg = s.page
        assert osio(s).locator(".ai-lock").count() == 1
        pg.fill("#ai-login [name=email]", "eiosoite")
        pg.click("#ai-login [type=submit]")
        assert "Tarkista sähköpostiosoite." in osio(s).inner_text() and not tila["auth"]
        pg.fill("#ai-login [name=email]", "testi@esimerkki.test")
        pg.click("#ai-login [type=submit]")
        pg.wait_for_selector("#ai-code")
        assert tila["auth"][-1] == ("otp", {"email": "testi@esimerkki.test", "create_user": True}, AVAIN)
        assert "Koodi lähetetty" in osio(s).inner_text()
        assert pg.evaluate("document.activeElement.name") == "code"
        pg.fill("#ai-code [name=code]", "000000")
        pg.click("#ai-code [type=submit]")
        pg.wait_for_function("() => /ei kelpaa/.test(document.querySelector('.set-new').innerText)")
        assert pg.evaluate("localStorage.getItem('ajoura-tili')") is None
        pg.fill("#ai-code [name=code]", "123 456")
        pg.click("#ai-code [type=submit]")
        pg.wait_for_selector("[data-ai-toggle]")
        assert pg.evaluate("AjouraAccess.plan()") == "plus"
        assert "testi@esimerkki.test" in osio(s).inner_text() and "Kirjauduttu sisään." in osio(s).inner_text()
        assert tila["auth"][-1][1] == {"type": "email", "email": "testi@esimerkki.test", "token": "123456"}
        # Kirjautuminen säilyy uudelleenavauksessa; oikeus haetaan palvelimelta uudelleen.
        pg.reload()
        pg.wait_for_selector("[data-ai-toggle]")
        # Uloskirjautuminen: istunto pois laitteesta, Free ja lukko heti.
        pg.click("[data-ai-logout]")
        pg.wait_for_selector(".set-new .ai-lock")
        assert pg.evaluate("[localStorage.getItem('ajoura-tili'), AjouraAccess.plan()]") == [None, "free"]
        pg.wait_for_timeout(200)
        assert tila["auth"][-1][0] == "logout"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_kirjautuminen_linkilla(browser, base):
    """Jos Supabasen viestipohjassa on vain linkki, sen voi liittää koodikenttään."""
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO, extra={"ajoura-features-local": TIIMI})
    try:
        tila = palvelu(s, kirjautunut=False)
        s.page.fill("#ai-login [name=email]", "testi@esimerkki.test")
        s.page.click("#ai-login [type=submit]")
        s.page.fill("#ai-code [name=code]", SB + "/auth/v1/verify?token=linkkitunniste&type=magiclink&redirect_to=http://localhost:3000")
        s.page.click("#ai-code [type=submit]")
        s.page.wait_for_selector("[data-ai-toggle]")
        assert tila["auth"][-1][1] == {"type": "magiclink", "token_hash": "linkkitunniste"}
    finally:
        s.sulje()


def test_vanheneva_istunto_uusitaan_tai_kirjataan_ulos(browser, base):
    vanha = json.dumps({**json.loads(ISTUNTO), "access_token": "vanha", "expires_at": 1})
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO)
    try:
        s.page.evaluate("t => localStorage.setItem('ajoura-tili', t)", vanha)
        tila = palvelu(s, kirjautunut=False)
        assert s.page.evaluate("AjouraAccess.plan()") == "plus", "vanhentunutta tunnistetta ei uusittu"
        assert tila["auth"][0][0] == "token" and tila["auth"][0][1] == {"refresh_token": "uusinta-1"}
        assert json.loads(s.page.evaluate("localStorage.getItem('ajoura-tili')"))["refresh_token"] == "uusinta-2"
        # Palvelin hylkää uusinnan (istunto peruttu): kirjataan ulos, Free.
        s.page.evaluate("t => localStorage.setItem('ajoura-tili', t)", vanha)
        tila["uusinta_ok"] = False
        s.page.reload()
        s.page.wait_for_selector(".set-new .ai-lock")
        s.page.wait_for_function("() => localStorage.getItem('ajoura-tili') === null")
        assert s.page.evaluate("AjouraAccess.plan()") == "free"
    finally:
        s.sulje()


def test_vaarennetty_istunto_ei_avaa(browser, base):
    """Istunto on palvelimen allekirjoittama: laitteeseen kirjoitettu keksitty istunto ei anna Plussaa."""
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO, extra={"ajoura-tekoaly": "1"})
    try:
        s.page.evaluate("t => localStorage.setItem('ajoura-tili', t)",
                        json.dumps({**json.loads(ISTUNTO), "access_token": "vaarennetty"}))
        tila = palvelu(s, kirjautunut=False)
        assert tila["oikeuskyselyt"] == 1
        assert s.page.evaluate("AjouraAccess.plan()") == "free"
        assert s.page.evaluate(TUNNISTA, "ai.receipt") == "plan" and tila["ai"] == []
    finally:
        s.sulje()


@pytest.mark.parametrize("kieli", ["en", "sv"])
def test_kirjautuminen_kaannetty_ja_kapea(browser, base, kieli):
    from test_leveys import MITTAUS
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO, kieli=kieli, leveys=320, korkeus=640,
             extra={"ajoura-features-local": TIIMI})
    try:
        palvelu(s, kirjautunut=False)
        for vaihe in ("email", "code"):
            teksti = s.page.inner_text(".ai-acct")
            for fi in ("Tili", "Sähköposti", "Lähetä", "Koodi", "lähetettiin", "Vaihda"):
                assert fi not in teksti, f"{kieli}/{vaihe}: kääntämättä '{fi}': {teksti}"
            assert s.page.evaluate(MITTAUS)["yli"] <= 0, f"{kieli}/{vaihe}: levittää näkymän"
            assert s.page.evaluate("parseFloat(getComputedStyle(document.querySelector('.ai-login input')).fontSize)") >= 16
            if vaihe == "email":
                s.page.fill("#ai-login [name=email]", "pitka.osoite.testikayttaja@esimerkki-yritys.test")
                s.page.click("#ai-login [type=submit]")
                s.page.wait_for_selector("#ai-code")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
