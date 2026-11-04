"""0.88: etusivun viimeistely. Ajoneuvokortin toiminnot ovat kuvakepainikkeita ilman näkyvää tekstiä (plusmerkki kiinni
kuvakkeen oikeassa alakulmassa), kortti on aiempaa matalampi, huollon tila erottaa puuttuvan historian ja puuttuvan
muistutuksen, ja Lisää ajoneuvo -toiminto on etusivulla vain kerran (Oma talli -otsikon vieressä)."""
import pytest

import tiedot
from apu import KELLO, avaa, odota_nakyma
from test_lataus import hybridi

M = tiedot.merkinta


def talli():
    """Neljä ajoneuvoa: auto (huolto myöhässä päivän mukaan, kilometrejä vielä jäljellä), sähköauto, vene ja
    hybridi ilman merkintöjä, sekä auto, jolla on vain korjaus (ei huoltoa eikä katsastusta)."""
    a = tiedot.auto(id="a1", km=120000, events=[M("e1", "Huolto", "2025-06-01", 119000, items=["Moottoriöljy"])])
    s = tiedot.auto(id="s1", name="Kia Niro EV", plate="TST-202", fuel="Sähkö", body="suv",
                    events=[M("e2", "Huolto", "2026-04-04", 45100)], km=48200)
    v = tiedot.talli()[2]
    h = hybridi()
    k = tiedot.auto(id="k1", name="Volkswagen Passat", plate="TST-404", events=[M("e3", "Korjaus ja osan vaihto", "2026-05-01", 90000)], km=91000)
    return [a, s, v, h, k]


NIMET = {"a1": "Lisää tankkaus", "s1": "Lisää lataus", "tst3": "Lisää tankkaus", "hyb1": "Lisää tankkaus tai lataus",
         "k1": "Lisää tankkaus"}


@pytest.mark.parametrize("leveys", [320, 390])
def test_kuvakepainikkeet(browser, base, leveys):
    s = avaa(browser, base, "home", autot=talli(), leveys=leveys, kello=KELLO)
    pg = s.page
    try:
        assert pg.locator(".garage-row").count() == 5
        for cid, nimi in NIMET.items():
            rivi = pg.locator(".garage-row", has=pg.locator(f"[data-quickfuel={cid}]"))
            assert rivi.locator(".row-actions").inner_text().strip() == "", f"{cid}: painikkeissa näkyvää tekstiä"
            assert rivi.locator(".row-btn.fuel").get_attribute("aria-label") == nimi
            assert rivi.locator(".row-btn.note").get_attribute("aria-label") == "Lisää merkintä"
            for b in rivi.locator(".row-btn").all():
                r = b.bounding_box()
                assert 44 <= r["width"] <= 56 and 44 <= r["height"] <= 56, f"{cid}: kosketusalue {r}"
                ico, plus = b.locator(".act-ico").bounding_box(), b.locator(".act-plus").bounding_box()
                # Plus on kuvakkeen oikeassa alakulmassa: osittain päällekkäin, mutta ulottuu reunan yli.
                assert plus["width"] <= 14 and ico["width"] >= 20
                assert plus["x"] < ico["x"] + ico["width"] < plus["x"] + plus["width"], (cid, ico, plus)
                assert plus["y"] < ico["y"] + ico["height"] < plus["y"] + plus["height"], (cid, ico, plus)
                # Painike on kokonaan kortin sisällä eikä mene tekstin päälle.
                kortti, info = rivi.bounding_box(), rivi.locator(".row-info").bounding_box()
                assert r["x"] + r["width"] <= kortti["x"] + kortti["width"] and r["x"] >= info["x"] + info["width"]
        if leveys == 390:  # 0.87: noin 250 px; tavoite noin 15–20 % matalampi
            korkeudet = pg.eval_on_selector_all(".garage-row", "e => e.map(x => x.getBoundingClientRect().height)")
            assert max(korkeudet) <= 225, korkeudet
        assert pg.locator(".add-vehicle-row").count() == 0
        assert pg.locator("a.garage-add[href='#newcar']").count() == 1
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_painikkeet_ja_kortti_avaavat_oikean_nakyman(browser, base):
    s = avaa(browser, base, "home", autot=talli(), kello=KELLO)
    pg = s.page
    try:
        for cid in NIMET:
            pg.click(f"[data-quickfuel={cid}]"); pg.wait_for_selector("#quickfuel-form")
            pg.keyboard.press("Escape"); pg.wait_for_selector("#quickfuel-form", state="detached")
            pg.click(f".row-btn.note[href='#add/{cid}']"); odota_nakyma(s, f"add/{cid}")
            pg.go_back(); odota_nakyma(s, "home")
            pg.click(f".row-info[href='#vehicle/{cid}']"); odota_nakyma(s, f"vehicle/{cid}")
            pg.go_back(); odota_nakyma(s, "home")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_huollon_tilatekstit(browser, base):
    s = avaa(browser, base, "home", autot=talli(), kello=KELLO)
    pg = s.page
    try:
        teksti = lambda cid: pg.locator(f".garage-row:has([data-quickfuel={cid}]) .row-status").inner_text()
        # Huolto myöhässä päivän mukaan, kilometrejä vielä jäljellä: ei "Ajettavaa jäljellä".
        t = teksti("a1")
        assert "Huolto myöhässä" in t and "Kilometrirajaan n." in t and "Ajettavaa jäljellä" not in t, t
        assert "Huoltohistoria puuttuu" in teksti("hyb1")
        assert "Ei huoltomuistutuksia" in teksti("k1")
        assert "Huolto kunnossa" in teksti("s1") and "%" in teksti("s1")
    finally:
        s.sulje()


@pytest.mark.parametrize("kieli,nimi,tila", [("en", "Add fill-up or charge", "No service history"),
                                             ("sv", "Lägg till tankning eller laddning", "Servicehistorik saknas")])
def test_kaannokset(browser, base, kieli, nimi, tila):
    s = avaa(browser, base, "home", autot=talli(), kieli=kieli, kello=KELLO)
    try:
        assert s.page.get_attribute("[data-quickfuel=hyb1]", "aria-label") == nimi
        assert tila in s.page.locator(".garage-row:has([data-quickfuel=hyb1]) .row-status").inner_text()
    finally:
        s.sulje()
