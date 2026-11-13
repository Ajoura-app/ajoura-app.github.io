"""0.107 (Niklas): yhteinen kelluva ＋-painike (FAB) Koti-, Tankkaus- ja Raportit-välilehdillä.

Koti: Oma talli -otsikko ja sen Lisää ajoneuvo -linkki poistettu, ajoneuvokortit alkavat heti Tänään huomioitavaa
-kortin jälkeen, ＋ avaa Lisää ajoneuvo -lomakkeen. Tankkaus: ylärivin lisäyspainike poistettu, ＋ avaa nykyisen
tankkausikkunan valitulle ajoneuvolle. Raportit: ylärivin lisäyspainike poistettu, ＋ avaa valikon (Lisää huolto,
Lisää muistiinpano). Painike on alavalikon telakassa, pysyy paikallaan vieritettäessä eikä peitä alavalikkoa."""
import pytest

import tiedot
from apu import KELLO, avaa, valitse_ajoneuvo

M = tiedot.merkinta


def autot():
    T = tiedot.tankkaus
    a1 = tiedot.auto(id="a1", plate="TST-201", km=151000, fuels=[T("f1", "2026-06-01", 150000, 50.0, 90.0)],
                     events=[M("e1", "Huolto", "2026-03-01", 149000, items=["Moottoriöljy"])])
    a2 = tiedot.auto(id="a2", name="Testi Farmari", plate="TST-202", km=80000, fuels=[T("f2", "2026-07-01", 79000, 40.0, 72.0)])
    return [a1, a2]


SIJAINTI_JS = """() => {const sc = document.querySelector('#app-screen'), f = document.querySelectorAll('.tab-fab'),
  n = document.querySelector('.main-tabs').getBoundingClientRect(), g = sc.getBoundingClientRect(), b = f[0] && f[0].getBoundingClientRect();
  const a = [...document.querySelectorAll('.main-tabs a')].map(x => x.getBoundingClientRect());
  const cs = f[0] && getComputedStyle(f[0]);
  return {n: f.length, vasen: b.left-g.left, oikea: g.right - b.right, ylos: n.top - b.bottom, w: b.width, h: b.height, top: b.top,
          pyorea: cs && parseFloat(cs.borderTopLeftRadius) >= b.width / 2 - 1, tausta: cs && cs.backgroundColor,
          suodatin: cs && cs.filter, varjo: cs && cs.boxShadow, dockissa: !!f[0].closest('.tab-dock'),
          peittaa: a.some(r => !(b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom)),
          naytolla: b.left >= g.left && b.right <= g.right && b.top >= g.top && b.bottom <= g.bottom,
          teksti: f[0].innerText.trim()};}"""


@pytest.mark.parametrize("leveys", [320, 390, 430])
@pytest.mark.parametrize("nakyma,extra", [("home", {}), ("fuel/a1", {}), ("reports", {"ajoura-reports": '{"p":"year"}'})])
def test_sijainti_ja_ulkoasu(browser, base, leveys, nakyma, extra):
    s = avaa(browser, base, nakyma, autot=autot(), leveys=leveys, extra=extra, kello=KELLO)
    pg = s.page
    try:
        if nakyma=='home':
            assert pg.locator('.cinematic-brand a[href="#newcar"]').is_visible()
            assert pg.locator('.tab-fab').is_hidden()
            assert pg.locator('.assistant-widget').is_visible()
        else:
            r=pg.evaluate(SIJAINTI_JS)
            assert r['n']==1 and r['dockissa'] and r['naytolla'] and not r['peittaa'],r
            assert 8<=r['vasen']<=20 and r['ylos']>=8,r
            assert r['w']>=56 and r['h']>=56 and r['pyorea'],r
            assert r['tausta']!='rgba(0, 0, 0, 0)' and r['teksti']=='',r
            pg.locator('#app-screen').evaluate('(e)=>e.scrollTop=400');pg.wait_for_timeout(100)
            r2=pg.evaluate(SIJAINTI_JS)
            assert abs(r2['top']-r['top'])<1,r2
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("kotipalkki", [0, 34])
def test_iphone_safe_area_ja_tumma(browser, base, kotipalkki):
    s = avaa(browser, base, "home", autot=autot(), teema="dark", asennettu=True, ios=True, kello=KELLO)
    pg = s.page
    try:
        if kotipalkki:
            s.context.new_cdp_session(pg).send("Emulation.setSafeAreaInsetsOverride", {"insets": {"top": 47, "bottom": kotipalkki}})
            pg.wait_for_timeout(200)
        widget=pg.locator('.assistant-widget').bounding_box()
        nav=pg.locator('.main-tabs').bounding_box()
        assert widget['y']+widget['height']<=nav['y']
        assert pg.locator('.tab-fab').is_hidden()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("nakyma", ["vehicle/a1", "menu", "settings", "event/a1/e1", "newcar", "add/a1", "notes/a1"])
def test_ei_muilla_sivuilla(browser, base, nakyma):
    s = avaa(browser, base, nakyma, autot=autot(), kello=KELLO)
    try:
        assert s.page.locator(".tab-fab, #fab-menu").count() == 0
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_etusivu(browser, base):
    s = avaa(browser, base, "home", autot=autot(), kello=KELLO)
    pg = s.page
    try:
        assert pg.locator('.secretary-home').count() == 1
        assert pg.locator('.vehicle-home-card').count() == 2
        assert pg.locator('.garage-row').count() == 2
        assert pg.locator('.garage-add, .history-heading, .today-card').count() == 0
        assert pg.get_attribute(".cinematic-brand a[href='#newcar']", "aria-label") == "Lisää ajoneuvo"
        # Approved AI-first home: choose the second vehicle in the selector.
        valitse_ajoneuvo(pg,'a2')
        assert pg.locator('.garage-row[data-car=a2]').count() == 1
        assert pg.locator('[data-vehicle-toggle=a2]').get_attribute('aria-expanded')=='true'
        pg.click(".cinematic-brand a[href='#newcar']"); pg.wait_for_function("location.hash === '#newcar'"); pg.wait_for_timeout(200)
        assert pg.locator(".tab-fab").count() == 0
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_etusivu_tyhja_talli(browser, base):
    s = avaa(browser, base, "home", autot=[], kello=KELLO)
    try:
        assert "Oma talli" not in s.page.inner_text(".screen-content")
        assert s.page.locator(".tab-fab[href='#newcar']").count() == 1
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("auto,nimi", [("a1", "Lisää tankkaus"), ("a2", "Lisää tankkaus")])
def test_tankkaus_valittu_ajoneuvo(browser, base, auto, nimi):
    s = avaa(browser, base, f"fuel/{auto}", autot=autot(), kello=KELLO)
    pg = s.page
    try:
        assert pg.locator(".fv-bar .fv-add, .fv-bar .fl-add").count() == 0
        assert pg.get_attribute(".tab-fab", "aria-label") == nimi
        pg.click(".tab-fab"); pg.wait_for_selector("#quickfuel-form")
        assert pg.get_attribute("#quickfuel-form", "data-car") == auto
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tankkaus_tallennus(browser, base):
    s = avaa(browser, base, "fuel/a2", autot=autot(), kello=KELLO)
    pg = s.page
    try:
        pg.click(".tab-fab"); pg.wait_for_selector("#quickfuel-form"); pg.wait_for_timeout(300)
        pg.fill("#quickfuel-form [name=km]", "80500"); pg.fill("#quickfuel-form [name=qty]", "30"); pg.fill("#quickfuel-form [name=ppu]", "1,8")
        pg.click("#quickfuel-form [type=submit]"); pg.wait_for_selector(".sheet-layer", state="detached")
        a2 = [c for c in s.talli()["cars"] if c["id"] == "a2"][0]
        assert len(a2["fuels"]) == 2 and any(f["km"] == 80500 for f in a2["fuels"]), a2["fuels"]
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def auki(pg):
    return pg.evaluate("!document.querySelector('#fab-menu').hidden")


def test_raportit_valikko(browser, base):
    s = avaa(browser, base, "reports", autot=autot(), extra={"ajoura-reports": '{"p":"year"}'}, kello=KELLO)
    pg = s.page
    try:
        assert pg.locator(".fv-bar [data-rp-add], .fv-bar .fv-add").count() == 0
        f = ".tab-fab[data-fab-menu]"
        assert pg.get_attribute(f, "aria-label") == "Lisää merkintä" and pg.get_attribute(f, "aria-expanded") == "false"
        assert not auki(pg)
        pg.click(f)  # 1. painallus avaa
        assert auki(pg) and pg.get_attribute(f, "aria-expanded") == "true"
        assert pg.eval_on_selector_all("#fab-menu [role=menuitem]", "e => e.map(x => x.innerText.trim())") == ["Lisää huolto", "Lisää muistiinpano"]
        r = pg.evaluate("""() => {const m = document.querySelector('#fab-menu').getBoundingClientRect(), b = document.querySelector('.tab-fab').getBoundingClientRect(),
          n = document.querySelector('.main-tabs').getBoundingClientRect(), g = document.querySelector('#app-screen').getBoundingClientRect(),
          i = [...document.querySelectorAll('#fab-menu [role=menuitem]')].map(x => x.getBoundingClientRect().height);
          return {ylla: m.bottom <= b.top, naytolla: m.left >= g.left && m.right <= g.right && m.top >= g.top, alavalikko: m.bottom <= n.top, korkeus: Math.min(...i)}}""")
        assert r["ylla"] and r["naytolla"] and r["alavalikko"] and r["korkeus"] >= 44, r
        pg.click(f)  # 2. painallus sulkee
        assert not auki(pg)
        pg.click(f); pg.click(".app-heading")  # ulkopuolelle painaminen sulkee
        assert not auki(pg)
        # Näppäimistö: Enter avaa ja kohdistaa ensimmäiseen, nuolet liikkuvat, Escape sulkee ja palauttaa kohdistuksen.
        pg.focus(f); pg.keyboard.press("Enter")
        assert auki(pg) and pg.evaluate("document.activeElement.dataset.fabAct") == "svc"
        pg.keyboard.press("ArrowDown")
        assert pg.evaluate("document.activeElement.dataset.fabAct") == "memo"
        pg.keyboard.press("ArrowDown")
        assert pg.evaluate("document.activeElement.dataset.fabAct") == "svc"
        pg.keyboard.press("Escape")
        assert not auki(pg) and pg.evaluate("document.activeElement.matches('[data-fab-menu]')")
        # Näkymästä poistuminen sulkee valikon.
        pg.click(f); pg.click(".main-tabs a[aria-label='Tankkaus ja lataus']"); pg.wait_for_selector(".tab-fab.fl-add")
        assert pg.locator("#fab-menu").count() == 0
        pg.goto(base+"/app.html#reports"); pg.wait_for_function("location.hash === '#reports'"); pg.wait_for_timeout(150)
        assert not auki(pg)
        # Näppäimistöllä valinta: Kaikki ajoneuvot → ajoneuvon valinta → muistiinpanot.
        pg.focus(f); pg.keyboard.press("Enter"); pg.keyboard.press("ArrowDown"); pg.keyboard.press("Enter")
        pg.wait_for_selector(".rp-addsheet"); assert not auki(pg)
        assert "Lisää muistiinpano" in pg.inner_text(".rp-addsheet")
        pg.click('[data-rp-pickcar="a2"]'); pg.wait_for_function("location.hash === '#notes/a2'")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_raportit_yksi_ajoneuvo_tallissa(browser, base):
    s = avaa(browser, base, "reports", autot=autot()[:1], kello=KELLO)
    pg = s.page
    try:
        pg.click(".tab-fab"); pg.click("[data-fab-act=svc]")
        pg.wait_for_function("location.hash === '#add/a1'"); pg.wait_for_selector("#event-form")
        assert pg.locator(".sheet-layer").count() == 0
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tyopoyta(browser, base):
    """Tietokoneella sovellus on puhelinkehyksessä: painike kehyksen sisällä, alavalikon yläpuolella."""
    s = avaa(browser, base, "reports", autot=autot(), leveys=1280, korkeus=900, mobiili=False, kello=KELLO)
    pg = s.page
    try:
        r = pg.evaluate(SIJAINTI_JS)
        assert r["n"] == 1 and r["naytolla"] and not r["peittaa"] and r["ylos"] >= 8, r
        pg.click(".tab-fab"); assert auki(pg)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("kieli,nimet", [("en", ["Add vehicle", "Add entry", "Add service", "Add note"]),
                                         ("sv", ["Lägg till fordon", "Lägg till post", "Lägg till service", "Lägg till anteckning"])])
def test_kaannokset(browser, base, kieli, nimet):
    s = avaa(browser, base, "home", autot=autot(), kieli=kieli, kello=KELLO)
    pg = s.page
    try:
        assert pg.get_attribute(".tab-fab", "aria-label") == nimet[0]
        pg.goto(base+"/app.html#reports"); pg.wait_for_function("location.hash === '#reports'"); pg.wait_for_timeout(200)
        pg.click(".tab-fab"); pg.wait_for_timeout(100)
        assert pg.get_attribute(".tab-fab", "aria-label") == nimet[1]
        assert pg.eval_on_selector_all("#fab-menu [role=menuitem]", "e => e.map(x => x.innerText.trim())") == nimet[2:]
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.109 (Niklas): kelluva ＋ ja valittu alavalikon välilehti samaan vaaleaan värimaailmaan kuin ajoneuvokortin
# painikkeet: sama vaaleansininen tausta ja reunus kuin tankkauspainikkeella, sininen kuvake (kontrasti ≥ 3:1).
VARI_JS = """() => {const c = s => getComputedStyle(document.querySelector(s)), f = c(document.querySelector('.secretary-home')?'.vehicle-home-card > .secretary-actions button':'.tab-fab'), t = c('.main-tabs a[aria-current]'),
  k = document.querySelector('.vehicle-home-card > .secretary-actions button') && c('.vehicle-home-card > .secretary-actions button');
  const rgb = v => v.match(/\\d+/g).slice(0, 3).map(Number), lum = v => {const [r, g, b] = rgb(v).map(x => {x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;}); return .2126 * r + .7152 * g + .0722 * b;};
  const kontrasti = (a, b) => {const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05);};
  return {fab: f.backgroundColor, fabReuna: f.borderTopColor, tab: t.backgroundColor, kortti: k && k.backgroundColor, korttiReuna: k && k.borderTopColor,
          fabK: kontrasti(f.color, f.backgroundColor), tabK: kontrasti(t.color, t.backgroundColor)};}"""


@pytest.mark.parametrize("nakyma", ["home", "fuel/a1", "reports"])
def test_vaalea_varimaailma(browser, base, nakyma):
    s = avaa(browser, base, nakyma, autot=autot(), kello=KELLO)
    try:
        r = s.page.evaluate(VARI_JS)
        assert r["tab"] == "rgb(223, 234, 253)", r
        if r["kortti"]:
            # 2.10: etusivun pikapainikkeet ovat mallikuvan mukaan tekstipainikkeita ilman omaa taustaa.
            assert r["kortti"] == "rgba(0, 0, 0, 0)", r
        else:
            assert r["fab"] != "rgba(0, 0, 0, 0)", r
            assert r["fabK"] >= 3, r
        assert r["tabK"] >= 3, r
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
