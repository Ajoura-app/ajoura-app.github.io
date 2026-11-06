"""Kirjautuminen ja pilvitallennus (v0.116): Google-kirjautuminen (Supabase), talli synkronoituu laitteiden välillä
(sync.js), kuvat ja kuitit jäävät laitteelle, uloskirjautuminen ja tilin poisto eivät koske laitteen tietoihin.

Kaksi keksittyä laitetta käyttää samaa keksittyä pilveä (test_plus.palvelu, yhteinen tila). Oikeaan Supabaseen tai
Googleen ei oteta yhteyttä.
"""
import json
from urllib.parse import parse_qs, urlparse

import tiedot
from apu import KELLO, avaa
from test_plus import SB, TUNNISTE, palvelu, uusi_tila

KUVA = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDAsKCwsMDQwNDw4PDQ8RFBMS"


def laite(browser, base, nakyma="home", autot=None, tila=None, kirjautunut=True):
    s = avaa(browser, base, nakyma, autot=autot, kello=KELLO)
    tila = palvelu(s, kirjautunut=kirjautunut, tila=tila)
    return s, tila


def odota_pilvi(s, tila, ehto, aika=8000):
    """Odottaa, että pilven tila täyttää ehdon (synkronointi on ajastettu)."""
    for _ in range(aika // 100):
        if ehto(tila["pilvi"]):
            return
        s.page.wait_for_timeout(100)
    raise AssertionError(f"pilvi ei päivittynyt: {json.dumps(tila['pilvi'])[:300]}")


def autot(talli):
    return {c["id"]: c for c in talli["cars"]}


def test_google_kirjautuminen_ja_paluu(browser, base):
    """Painike vie Supabasen Google-kirjautumiseen ja takaisin sovellukseen; istunto tallentuu, talli lähtee pilveen."""
    s = avaa(browser, base, "login", autot=tiedot.talli(), kello=KELLO)
    try:
        tila = palvelu(s, kirjautunut=False, lataa=False)
        nappi = s.page.locator("[data-sync-google]")
        osoite = urlparse(nappi.get_attribute("href"))
        q = parse_qs(osoite.query)
        assert f"{osoite.scheme}://{osoite.netloc}{osoite.path}" == SB + "/auth/v1/authorize"
        assert q["provider"] == ["google"] and q["redirect_to"] == [base + "/app.html"]
        # Supabase palauttaa sovellukseen istunnon osoitteen #-osassa (implicit flow).
        s.context.route(SB + "/auth/v1/authorize*", lambda r: r.fulfill(status=302, headers={
            "Location": base + f"/app.html#access_token={TUNNISTE}&refresh_token=r-1&expires_in=3600&token_type=bearer"}))
        nappi.click()
        s.page.wait_for_function("() => !!(window.AjouraAccess && AjouraAccess.account())")
        assert "access_token" not in s.page.url, "istunto jäi osoiteriville"
        assert json.loads(s.page.evaluate("localStorage.getItem('ajoura-tili')"))["user"]["email"] == "testi@esimerkki.test"
        odota_pilvi(s, tila, lambda p: p is not None)
        assert set(autot(tila["pilvi"]["data"])) == {c["id"] for c in tiedot.talli()}
        s.page.wait_for_function("() => AjouraAccess.plan() === 'plus'")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_epaonnistunut_kirjautuminen(browser, base):
    s = avaa(browser, base, None, kello=KELLO, odota=False)
    try:
        s.page.goto(base + "/app.html?paluu=1#error=access_denied&error_code=403&error_description=Denied")
        s.page.wait_for_selector("[data-sync-google]")
        assert "Kirjautuminen ei onnistunut" in s.page.inner_text("#app-screen")
        assert s.page.evaluate("localStorage.getItem('ajoura-tili')") is None
    finally:
        s.sulje()


def test_talli_siirtyy_laitteelta_toiselle_ilman_kuvia(browser, base):
    talli = tiedot.talli()
    talli[0]["events"][0]["photos"] = [KUVA]
    a, tila = laite(browser, base, autot=talli)
    b = None
    try:
        odota_pilvi(a, tila, lambda p: p is not None)
        pilvessa = autot(tila["pilvi"]["data"])
        assert set(pilvessa) == {c["id"] for c in talli}
        assert "photos" not in json.dumps(tila["pilvi"]["data"]), "kuvat lähtivät pilveen"
        # Toinen laite, tyhjä talli: autot ja merkinnät tulevat pilvestä, kuvat eivät.
        b, _ = laite(browser, base, autot=[], tila=tila)
        b.page.wait_for_function("n => JSON.parse(localStorage.getItem('ajoura-app-v2') || '{}').cars?.length === n", arg=len(talli))
        saatu = autot(b.talli())
        assert saatu[talli[0]["id"]]["events"][0]["id"] == talli[0]["events"][0]["id"]
        assert "photos" not in saatu[talli[0]["id"]]["events"][0]
        # Ensimmäisellä laitteella kuva on tallessa.
        assert autot(a.talli())[talli[0]["id"]]["events"][0]["photos"] == [KUVA]
        assert not a.virheet and not b.virheet, a.virheet + b.virheet
    finally:
        a.sulje()
        if b:
            b.sulje()


def test_muutokset_ja_poistot_kulkevat_molempiin_suuntiin(browser, base):
    a, tila = laite(browser, base, autot=tiedot.talli())
    b = None
    try:
        odota_pilvi(a, tila, lambda p: p is not None)
        b, _ = laite(browser, base, autot=[], tila=tila)
        b.page.wait_for_function("() => (JSON.parse(localStorage.getItem('ajoura-app-v2') || '{}').cars || []).length > 0")
        auto = tiedot.talli()[0]["id"]
        poistettava = tiedot.talli()[0]["events"][0]["id"]
        # Laite B poistaa merkinnän ja lisää tankkauksen.
        b.page.evaluate("""([auto, id]) => { const st = AjouraApp.state(); const c = st.cars.find(c => c.id === auto);
            const next = { ...st, cars: st.cars.map(x => x.id !== auto ? x : { ...c, events: c.events.filter(e => e.id !== id),
              fuels: [...(c.fuels || []), { id: 'fuel-b1', date: '2026-10-28', km: c.km + 300, qty: 40, cost: 72, full: true }] }) };
            return AjouraApp.apply(next); }""", [auto, poistettava])
        b.page.evaluate("AjouraSync.changed()")
        odota_pilvi(b, tila, lambda p: any(f["id"] == "fuel-b1" for f in autot(p["data"])[auto].get("fuels", [])))
        rev = tila["pilvi"]["rev"]
        # Laite A hakee muutokset (sovellus palaa näkyviin).
        a.page.evaluate("AjouraSync.start()")
        a.page.wait_for_function("([auto, id]) => { const c = AjouraApp.state().cars.find(c => c.id === auto);"
                                 " return c.fuels.some(f => f.id === 'fuel-b1') && !c.events.some(e => e.id === id); }", arg=[auto, poistettava])
        assert tila["pilvi"]["rev"] >= rev
        assert not a.virheet and not b.virheet, a.virheet + b.virheet
    finally:
        a.sulje()
        if b:
            b.sulje()


def test_ensimmainen_synkronointi_yhdistaa_eika_poista(browser, base):
    """Kun pilvessä on jo talli (toinen laite) ja laitteella omat autot, kirjautuminen yhdistää: mitään ei katoa."""
    tila = uusi_tila()
    toinen = tiedot.talli()[1]
    tila["pilvi"] = {"data": {"cars": [toinen], "sequence": 5, "profile": {"name": "", "months": 12, "km": 15000}}, "rev": 3}
    oma = [tiedot.talli()[0], tiedot.talli()[2]]
    a, _ = laite(browser, base, autot=oma, tila=tila)
    try:
        odota_pilvi(a, tila, lambda p: p["rev"] > 3)
        ids = {c["id"] for c in tiedot.talli()}
        assert set(autot(tila["pilvi"]["data"])) == ids
        a.page.wait_for_function("n => AjouraApp.state().cars.length === n", arg=len(ids))
    finally:
        a.sulje()


def test_samanaikainen_tallennus_yhdistetaan(browser, base):
    """Toinen laite tallensi välissä (versio vaihtui): sovellus hakee uuden version ja yhdistää, ei kirjoita yli."""
    a, tila = laite(browser, base, autot=tiedot.talli())
    try:
        odota_pilvi(a, tila, lambda p: p is not None)
        auto = tiedot.talli()[0]["id"]
        data = json.loads(json.dumps(tila["pilvi"]["data"]))
        c = next(x for x in data["cars"] if x["id"] == auto)
        c.setdefault("fuels", []).append({"id": "fuel-toinen", "date": "2026-10-27", "km": c["km"] + 100, "qty": 30, "cost": 55, "full": True})
        tila["pilvi"] = {"data": data, "rev": tila["pilvi"]["rev"] + 1}
        a.page.evaluate("""auto => { const st = AjouraApp.state(); return AjouraApp.apply({ ...st, cars: st.cars.map(x => x.id !== auto ? x :
            { ...x, fuels: [...(x.fuels || []), { id: 'fuel-oma', date: '2026-10-28', km: x.km + 400, qty: 41, cost: 75, full: true }] }) }); }""", auto)
        a.page.evaluate("AjouraSync.changed()")
        odota_pilvi(a, tila, lambda p: {"fuel-toinen", "fuel-oma"} <= {f["id"] for f in autot(p["data"])[auto]["fuels"]})
        a.page.wait_for_function("auto => AjouraApp.state().cars.find(c => c.id === auto).fuels.some(f => f.id === 'fuel-toinen')", arg=auto)
    finally:
        a.sulje()


def test_uloskirjautuminen_ja_tilin_poisto_eivat_koske_laitteen_tietoihin(browser, base):
    a, tila = laite(browser, base, nakyma="me", autot=tiedot.talli())
    try:
        odota_pilvi(a, tila, lambda p: p is not None)
        ennen = a.talli()["cars"]
        a.page.reload()
        a.page.wait_for_selector("[data-sync-delete]")
        assert "testi@esimerkki.test" in a.page.inner_text(".sync-box")
        assert "pilveen" in a.page.inner_text("#app-screen"), "Tietosi-teksti väittää, ettei mitään lähetetä"
        a.page.click("[data-sync-delete]")  # vahvistusikkuna hyväksytään (apu.avaa)
        a.page.wait_for_function("() => localStorage.getItem('ajoura-tili') === null")
        assert tila["poistettu"] and tila["pilvi"] is None
        assert a.talli()["cars"] == ennen, "tilin poisto muutti laitteen tietoja"
        assert a.page.evaluate("[AjouraAccess.account(), AjouraAccess.plan()]") == [None, "free"]
        a.page.wait_for_selector(".sync-box a[href='#login']")
        # Poiston jälkeen ei synkronoida mitään takaisin.
        pyynnot = len(tila["pilvipyynnot"])
        a.page.evaluate("AjouraSync.changed()")
        a.page.wait_for_timeout(2000)
        assert len(tila["pilvipyynnot"]) == pyynnot and tila["pilvi"] is None
    finally:
        a.sulje()


def test_uloskirjautuminen_sailyttaa_tiedot(browser, base):
    a, tila = laite(browser, base, nakyma="me", autot=tiedot.talli())
    try:
        odota_pilvi(a, tila, lambda p: p is not None)
        a.page.reload()
        a.page.wait_for_selector("[data-sync-out]")
        ennen = a.talli()["cars"]
        a.page.click("[data-sync-out]")
        a.page.wait_for_function("() => localStorage.getItem('ajoura-tili') === null")
        assert a.talli()["cars"] == ennen and tila["pilvi"] is not None
        assert tila["auth"][-1][0] == "logout"
    finally:
        a.sulje()


def test_kirjautumisnakyma_kielet(browser, base):
    for kieli, sana in (("en", "Sign in with Google"), ("sv", "Logga in med Google")):
        s = avaa(browser, base, "login", kello=KELLO, kieli=kieli, leveys=320)
        try:
            teksti = s.page.inner_text("#app-screen")
            assert sana in teksti and "pilveen" not in teksti and "Kirjaudu" not in teksti, teksti
            assert s.page.evaluate("document.querySelector('#app-screen .screen-content').scrollWidth <= 320")
        finally:
            s.sulje()
