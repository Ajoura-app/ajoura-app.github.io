"""2. Ajoneuvon lisäys lomakkeella ja tietojen säilyminen sivun uudelleenlatauksen jälkeen."""
from apu import KELLO, avaa, odota_nakyma


def test_auton_lisays_kasin(browser, base):
    s = avaa(browser, base, "newcar", autot=None, kello=KELLO)
    pg = s.page
    try:
        pg.click("[data-kind=car]")
        pg.click("[data-method=manual]")
        pg.select_option("#car-form [name=brand]", "Toyota")
        pg.wait_for_selector("#car-form [name=model]:not([disabled])")
        pg.select_option("#car-form [name=model]", "Corolla")
        pg.fill("#car-form [name=plate]", "TST-303")
        pg.select_option("#car-form [name=year]", "2018")
        pg.fill("#car-form [name=km]", "98000")
        pg.select_option("#car-form [name=fuel]", "Bensiini")
        pg.click("#car-form [type=submit]")
        pg.wait_for_selector("#look-form")
        pg.locator("#look-form label:has([name=color])").nth(2).click()
        pg.click("#look-form [type=submit]")
        odota_nakyma(s, "vehicle/")

        talli = s.talli()
        assert len(talli["cars"]) == 1
        c = talli["cars"][0]
        assert (c["name"], c["plate"], c["year"], c["km"], c["fuel"]) == ("Toyota Corolla", "TST-303", 2018, 98000, "Bensiini")
        assert c["body"] and c["color"]

        pg.goto(base + "/app.html#home")
        pg.reload()  # sama välilehti: esitäyttöä ei tehdä uudelleen, joten tiedot tulevat sovelluksen tallennuksesta
        pg.wait_for_timeout(600)
        assert "TST-303" in pg.inner_text("#app-screen"), "auto ei näy etusivulla uudelleenlatauksen jälkeen"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_auton_lisays_vaatii_tiedot(browser, base):
    s = avaa(browser, base, "newcar", autot=None, kello=KELLO)
    pg = s.page
    try:
        pg.click("[data-kind=car]")
        pg.click("[data-method=manual]")
        pg.fill("#car-form [name=plate]", "TST-303")
        pg.click("#car-form [type=submit]")
        assert "merkki" in pg.inner_text("#form-error").lower()
        assert s.talli() is None or not s.talli()["cars"], "keskeneräinen auto tallentui"
    finally:
        s.sulje()


def test_veneen_lisays(browser, base):
    s = avaa(browser, base, "newcar", autot=None, kello=KELLO)
    pg = s.page
    try:
        pg.click("[data-kind=boat]")
        f = "#kind-form"
        pg.select_option(f + " [name=brand]", index=1)
        pg.fill(f + " [name=model]", "Testi 500")
        pg.fill(f + " [name=reg]", "tst-v9")
        pg.select_option(f + " [name=year]", "2012")
        pg.fill(f + " [name=km]", "410")
        pg.click(f + " [type=submit]")
        pg.wait_for_selector("#klook-form")
        pg.click("#klook-form label:has([name=body][value=cabin])")
        pg.locator("#klook-form label:has([name=color])").first.click()
        pg.click("#klook-form [type=submit]")
        odota_nakyma(s, "vehicle/")
        c = s.talli()["cars"][0]
        assert c["color"]
        assert (c["kind"], c["body"], c["plate"], c["year"], c["km"]) == ("boat", "cabin", "TST-V9", 2012, 410)
        assert "h" in pg.inner_text("#app-screen"), "veneen tuntimittari ei näy"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
