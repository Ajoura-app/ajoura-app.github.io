"""0.88: etusivun viimeistely. Ajoneuvokortin toiminnot ovat kuvakepainikkeita ilman näkyvää tekstiä (plusmerkki kiinni
kuvakkeen oikeassa alakulmassa), kortti on aiempaa matalampi, huollon tila erottaa puuttuvan historian ja puuttuvan
muistutuksen, ja Lisää ajoneuvo -toiminto on etusivulla vain kerran (Oma talli -otsikon vieressä).
0.89: painikkeet takaisin huollon tilan alle, kolme vierekkäin: tankkaus/lataus, huoltomerkintä (jakoavain) ja
muistiinpano."""
import pytest

import tiedot
from apu import KELLO, avaa, odota_nakyma, valitse_ajoneuvo, avaa_ajoneuvovalitsin, avaa_ajoneuvon_tiedot, nykyinen_ajoneuvo
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
        assert pg.locator(".vehicle-home-card").count() == len(NIMET)
        assert pg.locator("[data-secretary-car]").count() == 0
        for cid in NIMET:
            rivi=pg.locator(f'.vehicle-home-card[data-car="{cid}"]')
            actions=rivi.locator(':scope > .secretary-actions')
            assert actions.locator(':scope > *').count()==3
            expected='Lataus +' if cid=='s1' else 'Tankkaus +'
            assert actions.locator('button').inner_text()==expected
            assert actions.locator('[data-secretary-service]').get_attribute('href')==f'#add/{cid}'
            assert actions.locator('[data-secretary-note]').get_attribute('href')==f'#notes/{cid}'
            assert rivi.locator('.vehicle-glance').is_visible()
            assert rivi.locator('.vehicle-panels').is_hidden()
            napit=[x.bounding_box() for x in actions.locator(':scope > *').all()]
            assert all(abs(n['y']-napit[0]['y'])<1 for n in napit)
            assert all(n['width']>=44 and n['height']>=44 for n in napit)
            assert napit[0]['x']<napit[1]['x']<napit[2]['x']
            valitse_ajoneuvo(pg,cid)
            rivi.locator('[data-vehicle-toggle]').click()
            assert rivi.locator('.vehicle-panels').is_hidden()
            assert all(x.is_visible() for x in actions.locator(':scope > *').all())
        assert pg.locator('.cinematic-brand a[href="#newcar"]').count()==1
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_painikkeet_ja_kortti_avaavat_oikean_nakyman(browser, base):
    s = avaa(browser, base, "home", autot=talli(), kello=KELLO)
    pg = s.page
    try:
        for cid in NIMET:
            valitse_ajoneuvo(pg,cid)
            avaa_ajoneuvon_tiedot(pg)
            pg.click(f".vehicle-home-card[data-car={cid}] > .secretary-actions [data-quickfuel={cid}]"); pg.wait_for_selector("#quickfuel-form")
            pg.keyboard.press("Escape"); pg.wait_for_selector("#quickfuel-form", state="detached")
            pg.click(f"[data-secretary-service][href='#add/{cid}']"); odota_nakyma(s, f"add/{cid}")
            pg.go_back(); odota_nakyma(s, "home")
            avaa_ajoneuvon_tiedot(pg)
            pg.click(f"[data-secretary-note][href='#notes/{cid}']"); odota_nakyma(s, f"notes/{cid}")
            assert pg.locator("#memo-form").count() == 1
            pg.go_back(); odota_nakyma(s, "home")
            avaa_ajoneuvon_tiedot(pg)
            pg.click(f".row-info[href='#vehicle/{cid}']"); odota_nakyma(s, f"vehicle/{cid}")
            pg.go_back(); odota_nakyma(s, "home")
            avaa_ajoneuvon_tiedot(pg)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_huollon_tilatekstit(browser, base):
    s = avaa(browser, base, "home", autot=talli(), kello=KELLO)
    pg = s.page
    try:
        def teksti(cid):
            valitse_ajoneuvo(pg,cid)
            avaa_ajoneuvon_tiedot(pg)
            return pg.locator(f".vehicle-home-card[data-car={cid}] .home-service .row-status").inner_text()
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
        valitse_ajoneuvo(s.page,'hyb1')
        avaa_ajoneuvon_tiedot(s.page)
        assert s.page.get_attribute(".vehicle-home-card[data-car=hyb1] > .secretary-actions [data-quickfuel=hyb1]", "aria-label") == nimi
        assert tila in s.page.locator(".vehicle-home-card[data-car=hyb1] .row-status").inner_text()
    finally:
        s.sulje()


@pytest.mark.parametrize("teema", ["light", "dark"])
def test_painikkeiden_yhtenainen_vari(browser, base, teema):
    """0.90 (Niklas): tankkauspainike samaan vaaleaan ilmeeseen kuin huolto ja muistiinpano (ennen täysi sininen,
    joka näytti liian tummalta). Tummassa tilassa ei omaa käänteissuodatinta, joten kaikki kolme näyttävät samalta."""
    s = avaa(browser, base, "home", autot=talli(), teema=teema, kello=KELLO)
    try:
        avaa_ajoneuvon_tiedot(s.page)
        tyylit=s.page.eval_on_selector_all('.vehicle-home-card:first-of-type > .secretary-actions > *', """es=>es.map(e=>{const c=getComputedStyle(e);return [c.backgroundColor,c.borderTopColor,c.color,c.filter,c.boxShadow]})""")
        assert len(tyylit)==3 and tyylit[1]==tyylit[2],tyylit
        assert tyylit[0][0]!=tyylit[1][0],tyylit
        assert all(t[3]=='none' for t in tyylit),tyylit
    finally:
        s.sulje()


# 0.92 (Niklas): Oman tallin järjestys vaihtuu pitkällä painalluksella ja vetämällä. Järjestys on ajoneuvolistan
# järjestys, joten tallennettujen tietojen muoto ei muutu.
def jarjestys(s):
    return [c["id"] for c in s.talli()["cars"]]


def keski(pg, cid, osa=".row-info"):
    b = pg.locator(f".garage-row[data-car={cid}] {osa}").bounding_box()
    return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2


def test_jarjestys_hiirella(browser, base):
    s = avaa(browser, base, "home", autot=tiedot.talli(), korkeus=2000, mobiili=False, kello=KELLO)
    pg = s.page
    avaa_ajoneuvovalitsin(pg)
    pg.click('a[href="#car-order"]')
    pg.wait_for_selector('.garage-rows .garage-row')
    try:
        assert jarjestys(s) == ["tst1", "tst2", "tst3"]
        x, y = keski(pg, "tst3"); _, y1 = keski(pg, "tst1", "")
        pg.mouse.move(x, y); pg.mouse.down(); pg.wait_for_timeout(650)
        assert pg.locator(".garage-row.dragging").count() == 1, "kortti ei noussut pitkällä painalluksella"
        for i in range(1, 11):
            pg.mouse.move(x, y + (y1 - 160 - y) * i / 10); pg.wait_for_timeout(20)
        pg.mouse.up(); pg.wait_for_timeout(300)
        assert jarjestys(s) == ["tst3", "tst1", "tst2"]
        assert pg.evaluate("location.hash") == "#car-order", "vapautus avasi ajoneuvon"
        assert pg.eval_on_selector_all(".garage-row", "e => e.map(x => x.dataset.car)") == ["tst3", "tst1", "tst2"]
        # Lyhyt napautus avaa edelleen ajoneuvon; liike ennen pitkää painallusta ei siirrä korttia.
        x, y = keski(pg, "tst2")
        pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x, y - 40); pg.wait_for_timeout(650)
        assert pg.locator(".garage-row.dragging").count() == 0
        pg.mouse.up()
        assert jarjestys(s) == ["tst3", "tst1", "tst2"]
        pg.click(".garage-row[data-car=tst1] .row-info"); pg.wait_for_function("location.hash === '#vehicle/tst1'")
        pg.reload(); pg.wait_for_selector("#app-screen .screen-content")
        assert jarjestys(s) == ["tst3", "tst1", "tst2"]
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_jarjestys_kosketuksella(browser, base):
    """Puhelin: kosketus pitkään paikallaan, sitten veto alas. Näkymä ei vieritä vedon alla."""
    s = avaa(browser, base, "home", autot=tiedot.talli(), korkeus=2000, kello=KELLO)
    pg = s.page
    avaa_ajoneuvovalitsin(pg)
    pg.click('a[href="#car-order"]')
    pg.wait_for_selector('.garage-rows .garage-row')
    try:
        cdp = pg.context.new_cdp_session(pg)
        kosketa = lambda tyyppi, x, y: cdp.send("Input.dispatchTouchEvent", {
            "type": tyyppi, "touchPoints": [] if tyyppi == "touchEnd" else [{"x": x, "y": y, "id": 1}]})
        x, y = keski(pg, "tst1"); _, y3 = keski(pg, "tst3", "")
        kosketa("touchStart", x, y); pg.wait_for_timeout(650)
        assert pg.locator(".garage-row.dragging").count() == 1
        for i in range(1, 13):
            kosketa("touchMove", x, y + (y3 + 80 - y) * i / 12); pg.wait_for_timeout(20)
        kosketa("touchEnd", 0, 0); pg.wait_for_timeout(300)
        assert jarjestys(s) == ["tst2", "tst3", "tst1"]
        assert pg.evaluate("location.hash") == "#car-order"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_kuvakkeiden_viiva(browser, base):
    """0.93 (Niklas): painikkeiden kuvakkeet ohuemmalla viivalla (ennen 2, nyt 1,5 kuvakkeen ruudukossa)."""
    s = avaa(browser, base, "home", autot=talli(), kello=KELLO)
    try:
        avaa_ajoneuvon_tiedot(s.page)
        viivat=s.page.eval_on_selector_all('.vehicle-home-card:first-of-type > .secretary-actions svg', 'es=>es.map(e=>getComputedStyle(e).strokeWidth)')
        assert len(viivat)==3 and set(viivat)=={'1.7px'},viivat
    finally:
        s.sulje()
