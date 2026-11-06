"""Jaettu talli (v0.117): omistaja kutsuu linkillä, kutsuttu kirjautuu omalla tilillään ja liittyy, molemmat näkevät ja
muokkaavat samaa tallia, liittyjän omat autot siirtyvät yhteiseen talliin, omistaja voi poistaa jäsenen ja jäsen voi
poistua (tiedot jäävät hänen laitteelleen). Keksitty Supabase (test_plus.palvelu, kaksi käyttäjää), ei oikeaa palvelua.
"""
import tiedot
from apu import KELLO, avaa
from test_plus import istunto, palvelu, uusi_tila


def omistaja_kutsuu(browser, base, tila):
    o = avaa(browser, base, "me", autot=[tiedot.talli()[0], tiedot.talli()[1]], kello=KELLO)
    palvelu(o, tila=tila)
    o.page.wait_for_function("() => true")
    for _ in range(80):
        if tila["pilvi"] is not None:
            break
        o.page.wait_for_timeout(100)
    o.page.wait_for_selector("[data-sync-invite]")
    o.page.click("[data-sync-invite]")
    linkki = o.page.locator("[data-sync-link]")
    linkki.wait_for()
    return o, linkki.input_value()


def puoliso_liittyy(browser, base, tila, linkki):
    p = avaa(browser, base, None, autot=[tiedot.talli()[2]], kello=KELLO, odota=False)
    palvelu(p, tila=tila, kirjautunut=False, lataa=False)
    p.page.goto(linkki.replace("/app.html#", "/app.html?kutsu=1#"))
    p.page.wait_for_selector("[data-sync-google]")
    assert "Sinut on kutsuttu jaettuun talliin" in p.page.inner_text("#app-screen")
    assert p.page.url.endswith("#liity"), "kutsukoodi jäi osoiteriville"
    # Kirjautuminen omalla tilillä (Google-paluu on testattu test_pilvi.py:ssä): istunto ja uudelleenavaus.
    p.page.evaluate("t => localStorage.setItem('ajoura-tili', t)", istunto("tunniste-2"))
    p.page.reload()
    p.page.wait_for_selector("[data-sync-join]")
    assert "siirtyvät yhteiseen talliin" in p.page.inner_text("#app-screen")
    p.page.click("[data-sync-join]")
    p.page.wait_for_function("() => location.hash === '#me'")
    return p


def odota(sivu, ehto, viesti, kertaa=100):
    for _ in range(kertaa):
        if ehto():
            return
        sivu.page.wait_for_timeout(100)
    raise AssertionError(viesti)


def test_kutsu_liittyminen_ja_yhteinen_muokkaus(browser, base):
    tila = uusi_tila()
    o, linkki = omistaja_kutsuu(browser, base, tila)
    p = None
    try:
        assert linkki.startswith(base + "/app.html#liity=")
        p = puoliso_liittyy(browser, base, tila, linkki)
        assert tila["jasenet"] == {"u-2": "u-1"} and "u-2" not in tila["pilvet"]
        # Yhteinen talli: omistajan kaksi autoa ja puolison oma auto, sekä pilvessä että puolison laitteella.
        kaikki = {c["id"] for c in tiedot.talli()}
        odota(p, lambda: {c["id"] for c in tila["pilvi"]["data"]["cars"]} == kaikki, "puolison auto ei siirtynyt yhteiseen talliin")
        p.page.wait_for_function("n => AjouraApp.state().cars.length === n", arg=len(kaikki))
        assert "Liityit jaettuun talliin" in p.page.inner_text("#app-screen")
        assert "testi@esimerkki.test" in p.page.inner_text(".sync-share")
        assert p.page.locator("[data-sync-invite]").count() == 0, "jäsen voi kutsua"
        # Omistaja saa puolison auton ja näkee jäsenen.
        o.page.evaluate("AjouraSync.start()")
        o.page.wait_for_function("n => AjouraApp.state().cars.length === n", arg=len(kaikki))
        o.page.reload()
        o.page.wait_for_function("() => /puoliso@esimerkki.test/.test(document.querySelector('.sync-share')?.innerText || '')")
        # Puoliso lisää tankkauksen, omistaja näkee sen.
        auto = tiedot.talli()[0]["id"]
        p.page.evaluate("""auto => { const st = AjouraApp.state(); return AjouraApp.apply({ ...st, cars: st.cars.map(x => x.id !== auto ? x :
            { ...x, fuels: [...(x.fuels || []), { id: 'fuel-puoliso', date: '2026-10-28', km: x.km + 250, qty: 38, cost: 70, full: true }] }) }); }""", auto)
        p.page.evaluate("AjouraSync.changed()")
        odota(p, lambda: any(f["id"] == "fuel-puoliso" for c in tila["pilvi"]["data"]["cars"] if c["id"] == auto for f in c.get("fuels", [])), "puolison tankkaus ei mennyt omistajan talliin")
        o.page.evaluate("AjouraSync.start()")
        o.page.wait_for_function("auto => AjouraApp.state().cars.find(c => c.id === auto).fuels.some(f => f.id === 'fuel-puoliso')", arg=auto)
        assert not o.virheet and not p.virheet, o.virheet + p.virheet
    finally:
        o.sulje()
        if p:
            p.sulje()


def test_omistaja_poistaa_jasenen(browser, base):
    tila = uusi_tila()
    o, linkki = omistaja_kutsuu(browser, base, tila)
    p = None
    try:
        p = puoliso_liittyy(browser, base, tila, linkki)
        odota(p, lambda: len(tila["pilvi"]["data"]["cars"]) == 3, "liittyminen ei valmistunut")
        o.page.reload()
        o.page.wait_for_selector("[data-sync-remove]")
        o.page.click("[data-sync-remove]")  # vahvistus hyväksytään (apu.avaa)
        odota(o, lambda: "u-2" not in tila["jasenet"], "jäsentä ei poistettu")
        o.page.wait_for_selector("[data-sync-remove]", state="detached")
        # Puolison seuraava synkronointi: oma talli, jossa on kopio; omistajan uudet muutokset eivät enää tule.
        ennen = {c["id"] for c in p.talli()["cars"]}
        p.page.evaluate("AjouraSync.start()")
        odota(p, lambda: "u-2" in tila["pilvet"], "poistetun jäsenen kopio ei tallentunut hänen omaksi tallikseen")
        assert {c["id"] for c in tila["pilvet"]["u-2"]["data"]["cars"]} == ennen
        assert len(tila["pilvi"]["data"]["cars"]) == 3, "omistajan talli muuttui jäsenen poistossa"
    finally:
        o.sulje()
        if p:
            p.sulje()


def test_jasen_poistuu_ja_tiedot_jaavat(browser, base):
    tila = uusi_tila()
    o, linkki = omistaja_kutsuu(browser, base, tila)
    p = None
    try:
        p = puoliso_liittyy(browser, base, tila, linkki)
        odota(p, lambda: len(tila["pilvi"]["data"]["cars"]) == 3, "liittyminen ei valmistunut")
        p.page.wait_for_selector("[data-sync-leave]")
        ennen = p.talli()["cars"]
        p.page.click("[data-sync-leave]")
        odota(p, lambda: "u-2" not in tila["jasenet"] and "u-2" in tila["pilvet"], "poistuminen ei onnistunut")
        assert p.talli()["cars"] == ennen
        p.page.wait_for_selector("[data-sync-invite]")  # nyt oma talli: voi kutsua
    finally:
        o.sulje()
        if p:
            p.sulje()


def test_virheelliset_kutsut(browser, base):
    tila = uusi_tila()
    o, linkki = omistaja_kutsuu(browser, base, tila)
    try:
        # Oma kutsu omalla tilillä.
        o.page.goto(linkki.replace("/app.html#", "/app.html?oma=1#"))
        o.page.wait_for_selector("[data-sync-join]")
        o.page.click("[data-sync-join]")
        o.page.wait_for_function("() => /oma kutsusi/.test(document.querySelector('#app-screen').innerText)")
        assert tila["jasenet"] == {}
    finally:
        o.sulje()
    p = avaa(browser, base, None, autot=[], kello=KELLO, odota=False)
    try:
        palvelu(p, tila=tila, tunniste="tunniste-2", lataa=False)
        p.page.goto(base + "/app.html?x=1#liity=keksittykoodi123")
        p.page.wait_for_selector("[data-sync-join]")
        p.page.click("[data-sync-join]")
        p.page.wait_for_function("() => /vanhentunut tai jo käytetty/.test(document.querySelector('#app-screen').innerText)")
        assert tila["jasenet"] == {}
        # Ilman kutsua liittymisnäkymä kertoo, ettei kutsua ole.
        p.page.goto(base + "/app.html?y=1#liity")
        p.page.wait_for_selector("text=Kutsua ei löytynyt")
    finally:
        p.sulje()


def test_jakaminen_kaannetty_ja_kapea(browser, base):
    tila = uusi_tila()
    o = avaa(browser, base, "me", autot=tiedot.talli(), kello=KELLO, kieli="sv", leveys=320)
    try:
        palvelu(o, tila=tila)
        o.page.wait_for_selector("[data-sync-invite]")
        o.page.click("[data-sync-invite]")
        o.page.wait_for_selector("[data-sync-link]")
        teksti = o.page.inner_text(".sync-share")
        for fi in ("Jaettu talli", "Kutsu esimerkiksi", "Kutsulinkki", "Jaa linkki"):
            assert fi not in teksti, f"kääntämättä '{fi}': {teksti}"
        assert o.page.evaluate("document.querySelector('#app-screen .screen-content').scrollWidth <= 320")
        assert not o.virheet, o.virheet
    finally:
        o.sulje()
