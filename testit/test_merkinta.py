"""3. Merkintä: lisäys, muokkaus ja poisto lomakkeella; huoltolaskuri nollautuu huollosta."""
import tiedot
from apu import KELLO, TANAAN, avaa, odota_nakyma


def auto_myohassa():
    """Auto, jonka edellinen huolto on yli 12 kk sitten (huolto myöhässä 29.10.2026)."""
    return [tiedot.auto(events=[tiedot.merkinta("e1", "Huolto", "2025-03-14", 128900, cost="289",
                                                items=["Moottoriöljy"])])]


def tayta(pg, tyyppi="Huolto", pvm=TANAAN, km="152400", hinta="310", tekija="self", toimenpiteet=("Moottoriöljy", "Öljynsuodatin"), lisatieto="Testimerkintä"):
    f = "#event-form"
    pg.select_option(f + " [name=type]", tyyppi)
    pg.fill(f + " [name=date]", pvm)
    pg.fill(f + " [name=km]", km)
    pg.fill(f + " [name=cost]", hinta)
    for t in toimenpiteet:
        pg.locator(f"{f} label:has([name=items][value='{t}'])").click()
    if tekija:
        pg.select_option(f + " [name=by]", tekija)
    pg.fill(f + " [name=note]", lisatieto)


def test_lisays_muokkaus_poisto(browser, base):
    s = avaa(browser, base, "home", autot=auto_myohassa(), kello=KELLO)
    pg = s.page
    try:
        assert pg.locator(".row-status.late").count() == 1, "lähtötilanteessa huollon pitäisi olla myöhässä"

        pg.goto(base + "/app.html#add/tst1")
        pg.wait_for_selector("#event-form")
        tayta(pg)
        pg.click("#event-form [type=submit]")
        odota_nakyma(s, "vehicle/tst1")
        c = s.talli()["cars"][0]
        assert len(c["events"]) == 2
        e = next(x for x in c["events"] if x["id"] != "e1")
        assert (e["type"], e["date"], e["km"], e["cost"], e["note"]) == ("Huolto", TANAAN, 152400, "310", "Testimerkintä")
        assert e["items"] == ["Moottoriöljy", "Öljynsuodatin"] and e["by"] == {"t": "self"}
        assert e["created"].startswith(TANAAN) and "updated" not in e
        assert c["km"] == 152400, "auton mittarilukema ei päivittynyt merkinnästä"

        pg.goto(base + "/app.html#home")
        pg.wait_for_timeout(300)
        assert pg.locator(".row-status.late").count() == 0, "huoltolaskuri ei nollautunut huollosta"

        # Muokkaus: tallennus ilman muutosta ei anna muokkausaikaa, muutos antaa.
        pg.goto(base + f"/app.html#edit/tst1/{e['id']}")
        pg.wait_for_selector("#event-form")
        pg.click("#event-form [type=submit]")
        odota_nakyma(s, "event/tst1/")
        assert "updated" not in next(x for x in s.talli()["cars"][0]["events"] if x["id"] == e["id"])
        pg.goto(base + f"/app.html#edit/tst1/{e['id']}")
        pg.wait_for_selector("#event-form")
        pg.fill("#event-form [name=cost]", "295.50")
        pg.click("#event-form [type=submit]")
        odota_nakyma(s, "event/tst1/")
        e2 = next(x for x in s.talli()["cars"][0]["events"] if x["id"] == e["id"])
        assert e2["cost"] == "295.50" and e2["created"] == e["created"] and e2["updated"].startswith(TANAAN)
        assert e2["items"] == e["items"], "muokkaus hävitti toimenpiteet"

        # Poisto (vahvistusikkuna hyväksytään automaattisesti).
        pg.click("[data-delete-event]")
        odota_nakyma(s, "vehicle/tst1")
        assert [x["id"] for x in s.talli()["cars"][0]["events"]] == ["e1"]
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_yritys_vaatii_nimen_ja_ytunnuksen_muodon(browser, base):
    s = avaa(browser, base, "add/tst1", autot=auto_myohassa(), kello=KELLO)
    pg = s.page
    try:
        tayta(pg, tekija="shop")
        pg.click("#event-form [type=submit]")
        pg.wait_for_timeout(300)
        assert len(s.talli()["cars"][0]["events"]) == 1, "merkintä tallentui ilman yrityksen nimeä"
        pg.fill("#event-form [name=by_n]", "Testikorjaamo Oy")
        pg.locator("#event-form details.by-contact summary").click()
        pg.fill("#event-form [name=by_yt]", "123")
        pg.click("#event-form [type=submit]")
        pg.wait_for_timeout(300)
        assert "Y-tunnus" in pg.inner_text("#form-error")
        pg.fill("#event-form [name=by_yt]", "1234567-8")
        pg.click("#event-form [type=submit]")
        odota_nakyma(s, "vehicle/tst1")
        e = [x for x in s.talli()["cars"][0]["events"] if x["id"] != "e1"][0]
        assert e["by"] == {"t": "shop", "n": "Testikorjaamo Oy", "yt": "1234567-8"}
    finally:
        s.sulje()


def test_tulevaisuuden_paiva_hylataan(browser, base):
    s = avaa(browser, base, "add/tst1", autot=auto_myohassa(), kello=KELLO)
    pg = s.page
    try:
        tayta(pg, pvm="2026-11-05")
        pg.click("#event-form [type=submit]")
        pg.wait_for_timeout(300)
        assert len(s.talli()["cars"][0]["events"]) == 1
    finally:
        s.sulje()
