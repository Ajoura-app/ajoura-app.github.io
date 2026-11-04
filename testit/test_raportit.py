"""9. Raportit ja Tankkaus: ajoneuvokuvat (0.50, 0.55), kululajit (0.51), ajoneuvon valinta (0.52) ja ajoneuvokortit (0.53)."""
import pytest

import tiedot
from apu import KELLO, avaa

M, T = tiedot.merkinta, tiedot.tankkaus
PYSTY = tiedot.jpeg((200, 40, 40), koko=(30, 60))  # pystykuva: vanha cover-rajaus leikkasi ajoneuvon pois


def talli(kuva=PYSTY):
    """Kolme ajoneuvoa, joista kahdella oma kuva; kulut neljässä lajissa (polttoaine, huollot, korjaukset, muut)."""
    return [
        tiedot.auto("a1", name="Testi Pakettiauto", plate="TST-201", body="panel", photo=kuva, events=[
            M("x1", "Korjaus ja osan vaihto", "2026-03-02", 140000, cost="496"),
            M("x2", "Huolto", "2026-05-10", 143000, cost="285")],
            fuels=[T("f1", "2026-09-01", 148000, 60, 110), T("f2", "2026-10-01", 149500, 70, 124)]),
        tiedot.auto("a2", name="Testi Farmari", plate="TST-202", photo=tiedot.jpeg((240, 240, 240), koko=(60, 30)),
                    events=[M("y1", "Huolto", "2026-04-01", 85000, cost="190")]),
        tiedot.auto("a3", name="Testi Asuntoauto", plate="TST-203", body="motorhome",
                    events=[M("z1", "Pesu ja hoito", "2026-10-21", 60000, cost="60")]),
    ]


RP = {"ajoura-reports": '{"p":"12","t":"sum"}'}


# 0.55: oma kuva täyttää ruudun tarkasti (cover, ei sumennettua kopiota 0.50:n tapaan), rajaus painottuu kuvan
# alaosaan (ajoneuvo on puhelinkuvassa yleensä alempana), eikä kuva veny ruudun ulkopuolelle (0.55:n korjaama vika:
# kuva näkyi omassa korkeudessaan, jolloin ruudussa näkyi kuvan yläosa).
KUVA_JS = """sel => [...document.querySelectorAll(sel)].filter(b => b.querySelector('img')).map(b => {
    const im = b.querySelector('img'), r = b.getBoundingClientRect(), f = im.getBoundingClientRect(), cs = getComputedStyle(im);
    return {luokka: im.className, fit: cs.objectFit, y: parseFloat(cs.objectPosition.split(' ')[1]), kpl: b.querySelectorAll('img').length,
            sama: Math.abs(f.left - r.left) < 1 && Math.abs(f.top - r.top) < 1 && Math.abs(f.width - r.width) < 1 && Math.abs(f.height - r.height) < 1,
            ladattu: im.naturalWidth > 0, korkeus: r.height};})"""


@pytest.mark.parametrize("nakyma,laatikko,extra", [
    ("reports", ".rp-vpic", RP),
    ("reports", ".rp-rthumb", {"ajoura-reports": '{"p":"12","t":"cars"}'}),
])
@pytest.mark.parametrize("teema", [None, "dark"])
def test_oma_kuva_tayttaa_ruudun(browser, base, nakyma, laatikko, extra, teema):
    s = avaa(browser, base, nakyma, autot=talli(), extra=extra, teema=teema, kello=KELLO)
    try:
        tulos = s.page.evaluate(KUVA_JS, laatikko)
        assert len(tulos) == 2, tulos  # kaksi ajoneuvoa, joilla on oma kuva
        for t in tulos:
            assert t["luokka"] == "own-ph" and t["kpl"] == 1 and t["ladattu"], t
            assert t["fit"] == "cover" and t["sama"] and 55 <= t["y"] <= 80 and t["korkeus"] > 20, t
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tankkausikkunan_kuva(browser, base):
    s = avaa(browser, base, "fuel/a1", autot=talli(), kello=KELLO)
    try:
        s.page.click("button.fl-add")
        s.page.wait_for_selector(".sheet-thumb img.own-ph")
        t = s.page.evaluate(KUVA_JS, ".sheet-thumb")[0]
        assert t["fit"] == "cover" and t["sama"], t
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def kuusi_lajia():
    t = talli()
    t[2]["events"] += [M("z2", "Katsastus", "2026-06-01", 60000, cost="55"), M("z3", "Renkaiden vaihto", "2026-06-02", 60000, cost="70")]
    return t


JAKAUMA_JS = """() => {const L = [...document.querySelectorAll('.rp-dist .rp-drow')], nro = t => Number((t || '').replace(/[^0-9]/g, ''));
  return {lajit: L.map(b => b.dataset.rpKind), euro: L.reduce((m, b) => m + nro(b.querySelector('b').textContent), 0),
          pros: L.reduce((m, b) => m + nro(b.querySelector('em').textContent), 0), summa: nro(document.querySelector('.rp-total .rp-big')?.textContent),
          yli: [...document.querySelectorAll('.rp-dt > *, .rp-total .rp-sec > div > *, .rp-total .rp-big')].filter(e => {const r = e.getBoundingClientRect(),
                 p = e.closest('.rp-card').getBoundingClientRect(); return r.right > p.right + 0.5 || (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis');}).map(e => e.textContent)};}"""


# 0.78 (korvaa 0.51:n ruudut): Kulujen jakautuminen omana osionaan vaakapalkein. Euromäärät summautuvat kokonaiskuluihin,
# prosentit tasan 100:aan (suurimman jakojäännöksen pyöristys), eikä mikään luku tai teksti mene kortin reunan yli.
@pytest.mark.parametrize("kieli", ["fi", "en", "sv"])
@pytest.mark.parametrize("leveys", [320, 390, 430])
def test_kulujen_jakautuminen(browser, base, kieli, leveys):
    for autot, lajit in [(talli(), 4), (kuusi_lajia(), 6)]:
        s = avaa(browser, base, "reports", autot=autot, kieli=kieli, leveys=leveys, extra=RP, kello=KELLO)
        try:
            r = s.page.evaluate(JAKAUMA_JS)
            assert len(r["lajit"]) == lajit and r["euro"] == r["summa"] and r["pros"] == 100 and not r["yli"], r
            assert not s.virheet, s.virheet
        finally:
            s.sulje()


def _rp(s):
    return s.page.evaluate("""() => ({
        napit: [...document.querySelectorAll('.rp-cars [data-rp-only]')].map(b => [b.dataset.rpOnly, b.getAttribute('aria-pressed')]),
        kortit: [...document.querySelectorAll('.rp-vcard strong')].map(e => e.textContent),
        summa: document.querySelector('.rp-total .rp-big')?.textContent.replace(/\\s/g, ''),
        huom: document.querySelector('.rp-note')?.textContent || '',
        off: JSON.parse(localStorage.getItem('ajoura-reports') || '{}').offCars || []})""")


# 0.56: ajoneuvo ja jakso valikkoina Yhteenvedon yläosassa (0.52–0.55 isot kuvanapit, poistettu). 0.62: ajoneuvot
# valitaan yhdestä luettelosta (Kaikki ajoneuvot tai mikä tahansa joukko; rivillä kuva, nimi ja rekisteritunnus), ja
# Näytä tarkemmin -osio isoine nappeineen poistui.
VALINTA_JS = """() => {const m = document.querySelector('.rp-cmenu');
  const rivit = m ? [...m.querySelectorAll('[data-rp-car]')] : [];
  return {auki: !!m?.open, naytetty: m?.querySelector('summary .rp-pick-t').textContent.trim(),
    kaikki: m?.querySelector('[data-rp-all]')?.getAttribute('aria-pressed'),
    rivit: rivit.map(b => [b.dataset.rpCar, b.getAttribute('aria-pressed'), b.querySelector('small')?.textContent, !!b.querySelector('.rp-mthumb')]),
    jakso: document.querySelector('.rp-filters [data-rp-period]')?.value,
    napit: document.querySelectorAll('.fl-car, .rp-cars, .rp-chip, [data-rp-more], .rp-detail, [data-rp-carpick]').length,
    alaotsikko: document.querySelectorAll('.rp-lead').length,
    kortit: [...document.querySelectorAll('.rp-vcard strong')].map(e => e.textContent),
    summa: document.querySelector('.rp-total .rp-big')?.textContent.replace(/\\s/g, ''),
    huom: document.querySelector('.rp-note')?.textContent || '',
    off: JSON.parse(localStorage.getItem('ajoura-reports') || '{}').offCars || []};}"""


def _valitse(s, *idt):
    for i in idt:
        s.page.click(".rp-cmenu>summary"); s.page.click(f'[data-rp-car="{i}"]'); s.page.wait_for_timeout(150)


def test_ajoneuvon_valinta_yhteenvedossa(browser, base):
    s = avaa(browser, base, "reports", autot=talli(), extra=RP, kello=KELLO)
    try:
        r = s.page.evaluate(VALINTA_JS)
        assert r["napit"] == 0 and r["alaotsikko"] == 0 and not r["auki"], r
        assert r["naytetty"] == "Kaikki ajoneuvot" and r["kaikki"] == "true" and r["jakso"] == "12", r
        assert r["rivit"] == [["a1", "false", "TST-201", True], ["a2", "false", "TST-202", True], ["a3", "false", "TST-203", True]], r
        assert r["summa"] == "1265€" and len(r["kortit"]) == 3 and not r["huom"], r
        # Kaikki-tilasta napautus näyttää vain sen ajoneuvon, ja luettelo sulkeutuu.
        _valitse(s, "a2")
        r = s.page.evaluate(VALINTA_JS)
        assert not r["auki"] and r["naytetty"] == "Testi Farmari" and r["summa"] == "190€" and r["kaikki"] == "false", r
        assert r["kortit"] == ["Testi Farmari"] and sorted(r["off"]) == ["a1", "a3"] and not r["huom"], r
        # Seuraava napautus lisää ajoneuvon: "2 ajoneuvoa".
        _valitse(s, "a3")
        r = s.page.evaluate(VALINTA_JS)
        assert r["naytetty"] == "2 ajoneuvoa" and r["summa"] == "250€" and r["off"] == ["a1"], r
        assert [x[1] for x in r["rivit"]] == ["false", "true", "true"], r
        # Viimeisen poisto palauttaa kaikki (ei tyhjää valintaa).
        _valitse(s, "a3", "a2")
        r = s.page.evaluate(VALINTA_JS)
        assert r["off"] == [] and r["naytetty"] == "Kaikki ajoneuvot" and r["summa"] == "1265€", r
        # Kaikki ajoneuvot -rivi.
        _valitse(s, "a1")
        s.page.click(".rp-cmenu>summary"); s.page.click("[data-rp-all]"); s.page.wait_for_timeout(150)
        assert s.page.evaluate(VALINTA_JS)["off"] == []
        # Napautus luettelon ulkopuolelle ja Escape sulkevat sen.
        s.page.click(".rp-cmenu>summary"); assert s.page.evaluate(VALINTA_JS)["auki"]
        s.page.click(".rp-head h2"); assert not s.page.evaluate(VALINTA_JS)["auki"]
        s.page.click(".rp-cmenu>summary"); s.page.keyboard.press("Escape"); assert not s.page.evaluate(VALINTA_JS)["auki"]
        s.page.select_option("[data-rp-period]", "all"); s.page.wait_for_timeout(150)
        assert s.page.evaluate(VALINTA_JS)["jakso"] == "all"
        # Kululajin rajaus näyttää ilmoituksen.
        s.page.click('[data-rp-kind="fuel"]'); s.page.wait_for_timeout(150)
        assert "kululajeista" in s.page.evaluate(VALINTA_JS)["huom"]
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.62: kulut kategorioittain ja kuukausittain; 0.78: kuukausikaavio HTML-pylväinä (jokainen kuukausi painike) ja kulujen
# jakautuminen omana osionaan, jonka riviä napauttamalla laji piilotetaan tai tuodaan takaisin. Pylväiden summa = kokonaiskulut.
KAAVIO_JS = """() => {const c = document.querySelector('.rp-cats'), d = document.querySelector('.rp-dist');
  const nro = t => Number((t || '').replace(/[^0-9]/g, ''));
  return {otsikko: c?.querySelector('h3').textContent, kaavio: c?.querySelectorAll('.rp-cols').length,
    pylvaat: [...(c?.querySelectorAll('.rp-col') || [])].reduce((m, b) => m + Number(b.dataset.rpT), 0), kuukausia: c?.querySelectorAll('.rp-col').length,
    summa: nro(document.querySelector('.rp-total .rp-big')?.textContent),
    ruudut: [...(d?.querySelectorAll('.rp-drow') || [])].map(b => [b.dataset.rpKind, b.getAttribute('aria-pressed'), b.querySelector('em').textContent]),
    tyhja: c?.querySelector('.rp-empty')?.textContent || '', kortit: document.querySelectorAll('.rp-vcard').length};}"""


@pytest.mark.parametrize("leveys", [320, 390])
def test_kulukaavio(browser, base, leveys):
    s = avaa(browser, base, "reports", autot=talli(), extra={"ajoura-reports": '{"p":"year","t":"sum"}'}, leveys=leveys, kello=KELLO)
    try:
        r = s.page.evaluate(KAAVIO_JS)
        assert r["otsikko"] == "Kulut kuukausittain" and r["kaavio"] == 1 and r["kuukausia"] == 10, r
        assert r["pylvaat"] == r["summa"] == 1265, r
        assert [x[0] for x in r["ruudut"]] == ["fuel", "service", "repair", "other"] and all(x[1] == "true" for x in r["ruudut"]), r
        s.page.click('[data-rp-kind="repair"]'); s.page.wait_for_timeout(150)
        r = s.page.evaluate(KAAVIO_JS)
        assert r["summa"] == r["pylvaat"] == 1265 - 496, r
        assert ["repair", "false", "Piilotettu"] in r["ruudut"] and len(r["ruudut"]) == 4, r
        assert s.page.evaluate("document.activeElement?.dataset.rpKind") == "repair"
        # Kaikki lajit piilossa: rivit jäävät näkyviin, jotta lajin voi tuoda takaisin.
        for k in ["fuel", "service", "other"]:
            s.page.click(f'[data-rp-kind="{k}"]'); s.page.wait_for_timeout(120)
        r = s.page.evaluate(KAAVIO_JS)
        assert "Valitse vähintään yksi kululaji" in r["tyhja"] and len(r["ruudut"]) == 4 and r["kortit"] == 0, r
        s.page.click('[data-rp-kind="service"]'); s.page.wait_for_timeout(150)
        r = s.page.evaluate(KAAVIO_JS)
        assert r["summa"] == r["pylvaat"] == 475 and r["kortit"] == 3, r  # kulutonkin ajoneuvo näkyy ("ei kirjattuja kuluja")
        # Kuukauden napautus näyttää sen kuukauden kulut (erillään koko jakson jakaumasta).
        s.page.click('.rp-col[data-rp-m="3"]'); s.page.wait_for_timeout(150)
        assert "Huhtikuu 2026" in s.page.inner_text(".rp-cats .rp-msel")
        assert s.page.get_attribute('.rp-col[data-rp-m="3"]', "aria-pressed") == "true"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.56: valikkorivi mahtuu ruudulle pitkillä nimillä kaikilla leveyksillä ja kielillä; 0.62: myös avattu ajoneuvoluettelo.
@pytest.mark.parametrize("kieli", ["fi", "en", "sv"])
@pytest.mark.parametrize("leveys", [320, 390, 430])
def test_valikot_ruudulla(browser, base, kieli, leveys):
    autot = talli()
    autot[1]["name"] = "Mercedes-Benz Sprinter 319 CDI Pitkä"
    s = avaa(browser, base, "reports", autot=autot, kieli=kieli, leveys=leveys, extra=RP, kello=KELLO)
    try:
        _valitse(s, "a2")
        s.page.click(".rp-cmenu>summary")
        r = s.page.evaluate("""() => {const sc = document.querySelector('.screen-content').getBoundingClientRect();
          const sis = e => {const b = e.getBoundingClientRect(); return b.left >= sc.left - 0.5 && b.right <= sc.right + 0.5;};
          return {valikot: [...document.querySelectorAll('.rp-filters .rp-pick')].map(p => ({sisalla: sis(p), korkeus: p.getBoundingClientRect().height})),
                  lista: sis(document.querySelector('.rp-cmenu .fl-cmenu-list')),
                  rivit: [...document.querySelectorAll('.rp-cmenu .fl-mi')].map(b => b.getBoundingClientRect().height)};}""")
        assert len(r["valikot"]) == 2 and all(x["sisalla"] and x["korkeus"] >= 40 for x in r["valikot"]), r
        assert r["lista"] and len(r["rivit"]) == 4 and min(r["rivit"]) >= 42, r
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.54: ajoneuvonapit eivät mene ruudun yli; Raportit-sivulla ajoneuvot valitaan valikosta (kaksi valikkoa).
# 0.98: Tankkaus-välilehden yläosa on yksi kolmen laatikon rivi (ajoneuvo, jakso, Uusi tankkaus), kaikki yhtä
# korkeita ja ruudun sisällä, eikä sivu vierity sivusuunnassa.
NAPIT_JS = """() => {const sc = document.querySelector('.screen-content').getBoundingClientRect();
  const rivi = [...(document.querySelector('.fv-bar')?.children || [])].map(e => e.getBoundingClientRect());
  const b = [...document.querySelectorAll('.rp-filters .rp-pick, .fv-bar > *')];
  return {valikot: document.querySelectorAll('.rp-filters .rp-pick').length, laatikot: rivi.length,
          korkeudet: [...new Set(rivi.map(r => Math.round(r.height)))].length, ylat: [...new Set(rivi.map(r => Math.round(r.top)))].length,
          alaotsikko: document.querySelectorAll('.rp-lead').length,
          yli: b.filter(e => {const r = e.getBoundingClientRect(); return r.left < sc.left - 0.5 || r.right > sc.right + 0.5;}).length,
          sivu: document.querySelector('#app-screen').scrollWidth - document.querySelector('#app-screen').clientWidth};}"""


def kuusi_autoa():
    autot = talli() + [tiedot.auto(f"b{i}", name=f"Lisäauto {i}", plate=f"TST-30{i}",
                                   fuels=[T(f"g{i}1", "2026-09-01", 1000, 40, 70), T(f"g{i}2", "2026-10-01", 1600, 40, 70)])
                       for i in range(3)]
    autot[1]["fuels"] = [T("h1", "2026-09-01", 85000, 40, 70), T("h2", "2026-10-01", 85700, 40, 70)]
    return autot


@pytest.mark.parametrize("leveys", [320, 390, 430])
@pytest.mark.parametrize("nakyma,extra,valikot,laatikot", [("fuel/a1", {}, 0, 3),
                                                           ("fuel", {"ajoura-fuel": '{"p":"12","t":"cmp"}'}, 0, 3),
                                                           ("reports", RP, 2, 0)])
def test_ajoneuvonapit_ruudulla(browser, base, leveys, nakyma, extra, valikot, laatikot):
    s = avaa(browser, base, nakyma, autot=kuusi_autoa(), leveys=leveys, extra=extra, kello=KELLO)
    try:
        r = s.page.evaluate(NAPIT_JS)
        assert r["valikot"] == valikot and r["laatikot"] == laatikot and r["alaotsikko"] == 0, r
        if laatikot:
            assert r["korkeudet"] == 1 and r["ylat"] == 1, r  # samankorkuiset, samalla rivillä
        assert r["yli"] == 0 and r["sivu"] <= 0, r
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.98: Tankkaus-välilehden ajoneuvovalikko: ajoneuvon napautus vaihtaa ajoneuvon ja sulkee valikon; valinta muistetaan,
# jakso säilyy ja laatikossa näkyy valitun rekisteri.
def test_tankkaus_ajoneuvovalikko(browser, base):
    s = avaa(browser, base, "fuel/a1", autot=kuusi_autoa(), kello=KELLO)
    pg = s.page
    try:
        assert "TST-201" in pg.inner_text(".fv-veh>summary")
        pg.select_option("[data-fl-period]", "all"); pg.wait_for_timeout(150)
        pg.click(".fv-veh>summary"); pg.click('[data-fl-car="a2"]'); pg.wait_for_timeout(150)
        assert pg.evaluate("location.hash") == "#fuel/a2"
        assert "TST-202" in pg.inner_text(".fv-veh>summary") and pg.evaluate("document.querySelector('.fv-veh').open") is False
        assert "Testi Farmari" in pg.inner_text(".rp-pdf")
        assert '"car":"a2"' in pg.evaluate("localStorage.getItem('ajoura-fuel')")
        assert pg.input_value("[data-fl-period]") == "all"  # jakso säilyy
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_yksi_ajoneuvo_ilman_valintaa(browser, base):
    s = avaa(browser, base, "reports", autot=talli()[:1], extra=RP, kello=KELLO)
    try:
        assert s.page.locator(".rp-cars").count() == 0
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.53: ajoneuvokortin selitteessä kululajin nimi summan vieressä, muutoksen vertailujakso näkyvissä ja pieni €/km "< 0,01".
# 0.76: vertailujakso on sama jakso vuotta aiemmin, ja muutos näkyy vain, kun kirjauksia on koko vertailujaksolta.
@pytest.mark.parametrize("kieli,nimi,vs", [("fi", "Korjaukset", "verrattuna samaan jaksoon vuotta aiemmin"),
                                           ("en", "Repairs", "compared with the same period a year earlier"),
                                           ("sv", "Reparationer", "jämfört med samma period ett år tidigare")])
def test_ajoneuvokortin_selite(browser, base, kieli, nimi, vs):
    autot = talli()
    autot[0]["events"].append(M("x0", "Huolto", "2025-06-01", 130000, cost="300"))  # vertailujaksolle kuluja → muutos
    autot[0]["fuels"].insert(0, T("f0", "2024-11-15", 120000, 50, 90))  # tankkauksia koko vertailujaksolta
    autot.append(tiedot.auto("a4", name="Testi Halpa", plate="TST-204", km=120000,
                             events=[M("w1", "Pesu ja hoito", "2025-11-01", 100000, cost="1")]))
    s = avaa(browser, base, "reports", autot=autot, kieli=kieli, extra=RP, kello=KELLO)
    try:
        assert nimi in s.page.inner_text(".rp-dist")
        kortti = s.page.locator(".rp-vcard", has_text="Testi Pakettiauto")
        assert kortti.locator(".rp-delta").count() == 1  # 0.78: lajien summat nimineen Ajoneuvot-välilehdellä (0.79)
        assert vs in s.page.inner_text(".rp-vs-note")
        assert "< 0,01" in s.page.locator(".rp-vcard", has_text="Testi Halpa").inner_text().replace(" ", " ")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.98: vertailu valitaan ajoneuvovalikon ruksilla: toinen ruksi vaihtaa vertailuun ja valikko pysyy auki, ajoneuvo ilman
# tankkauksia ei ole ruksittavissa, yksi jäljelle jäävä ruksi palaa sen ajoneuvon näkymään, viimeistä ei voi poistaa.
VERT_JS = """() => {const d = document.querySelector('.fv-veh'), sc = document.querySelector('.screen-content').getBoundingClientRect();
  const l = d?.querySelector('.fl-cmenu-list').getBoundingClientRect();
  return {auki: d?.open, teksti: d?.querySelector('summary .rp-pick-t').innerText.replace(/\\s+/g, ' ').trim(),
    valitut: [...document.querySelectorAll('[data-fl-cmpcar]')].map(b => [b.dataset.flCmpcar, b.getAttribute('aria-pressed'), b.disabled]),
    rivit: [...document.querySelectorAll('.fl-srows .fl-srn span[translate]')].map(e => e.textContent),
    yksi: !!document.querySelector('.fl-big'), hash: location.hash,
    sisalla: !d?.open || (l.left >= sc.left - 0.5 && l.right <= sc.right + 0.5),
    off: JSON.parse(localStorage.getItem('ajoura-fuel') || '{}').off || []};}"""


@pytest.mark.parametrize("leveys", [320, 390])
def test_vertailu_ajoneuvovalikko(browser, base, leveys):
    s = avaa(browser, base, "fuel/a1", autot=kuusi_autoa(), leveys=leveys, extra={"ajoura-fuel": '{"p":"12","t":"car"}'}, kello=KELLO)
    pg = s.page
    try:
        pg.click(".fv-veh>summary")
        r = pg.evaluate(VERT_JS)
        assert r["auki"] and r["sisalla"] and r["yksi"], r
        assert ["a3", "false", True] in r["valitut"] and ["a1", "true", False] in r["valitut"] and ["a2", "false", False] in r["valitut"], r
        pg.click('[data-fl-cmpcar="a2"]'); pg.wait_for_timeout(150)
        r = pg.evaluate(VERT_JS)
        assert r["auki"] and not r["yksi"] and sorted(r["rivit"]) == ["Testi Farmari", "Testi Pakettiauto"] and r["teksti"] == "2 valittu", r
        assert pg.evaluate("document.activeElement?.dataset.flCmpcar") == "a2"
        for i in ("b0", "b1", "b2"):
            pg.click(f'[data-fl-cmpcar="{i}"]'); pg.wait_for_timeout(100)
        assert pg.evaluate(VERT_JS)["teksti"] == "Kaikki"
        pg.click(".app-heading"); pg.wait_for_timeout(100)  # napautus valikon ulkopuolelle sulkee sen
        assert pg.evaluate(VERT_JS)["auki"] is False
        pg.click(".fv-veh>summary")
        for i in ("b0", "b1", "b2", "a1"):
            pg.click(f'[data-fl-cmpcar="{i}"]'); pg.wait_for_timeout(100)
        r = pg.evaluate(VERT_JS)  # vain Farmari jäljellä → sen oma näkymä
        assert r["yksi"] and r["hash"] == "#fuel/a2" and "TST-202" in r["teksti"], r
        pg.click('[data-fl-cmpcar="a2"]'); pg.wait_for_timeout(100)  # viimeistä ei poisteta
        assert pg.evaluate(VERT_JS)["yksi"]
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.61: iPhone avaa alasvetovalikon aina, kun se saa fokuksen. Valinnan jälkeen sivu piirretään uudelleen, ja
# ennen 0.61:tä fokus palautettiin valikkoon, jolloin valikko aukesi itsestään uudelleen. Kosketusnäytöllä fokusta
# ei palauteta valikkoon; tietokoneella (näppäimistö) se palautetaan kuten ennen.
@pytest.mark.parametrize("mobiili", [True, False])
@pytest.mark.parametrize("nakyma,extra,valikko,arvo", [
    ("reports", RP, "[data-rp-period]", "all"),
    ("fuel/a1", {}, "[data-fl-period]", "all"),
])
def test_valikon_fokus(browser, base, mobiili, nakyma, extra, valikko, arvo):
    s = avaa(browser, base, nakyma, autot=kuusi_autoa(), extra=extra, mobiili=mobiili, kello=KELLO)
    try:
        s.page.focus(valikko)
        s.page.select_option(valikko, arvo); s.page.wait_for_timeout(150)
        assert s.page.input_value(valikko) == arvo
        fokus = s.page.evaluate(f"document.activeElement?.matches('{valikko}')")
        assert fokus is (not mobiili), (mobiili, fokus)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.78: Yhteenvedon uusi rakenne. Kokonaiskulut isona lukuna, ajoneuvot ja tarkka jakso sen alla, toissijaiset luvut
# (€/kk ja €/km) kahdessa sarakkeessa; keskeneräinen kuukausi merkitty; tyhjä kuukausi ja kuluton ajoneuvo sanotaan
# sanoin (ei 0 €); ajoneuvojen summat = kokonaiskulut; kululajien värit samat kaaviossa, jakaumassa ja ajoneuvoriveillä.
YHT_JS = """() => {const t = document.querySelector('.rp-total'), nro = s => Number((s || '').replace(/[^0-9]/g, ''));
  const vari = sel => [...document.querySelectorAll(sel)].map(e => getComputedStyle(e).backgroundColor);
  return {iso: t.querySelector('.rp-big').textContent.replace(/\\s/g, ''), ctx: t.querySelector('.rp-ctx').innerText,
    sec: [...t.querySelectorAll('.rp-sec > div')].map(d => d.innerText.replace(/\\s+/g, ' ')), chg: t.querySelector('.rp-chg')?.innerText || '',
    osat: [...document.querySelectorAll('.rp-col.part')].map(b => b.dataset.rpM), kk: document.querySelectorAll('.rp-col').length,
    valittu: document.querySelector('.rp-msel').innerText.replace(/\\s+/g, ' '),
    rivit: [...document.querySelectorAll('.rp-vlist .rp-vcard')].map(a => [a.querySelector('strong').textContent, a.querySelector('.rp-vtop b').textContent.replace(/\\s/g, ''), a.querySelector('.rp-vmid').innerText]),
    rivisumma: [...document.querySelectorAll('.rp-vlist .rp-vtop b')].reduce((m, b) => m + nro(b.textContent), 0),
    varit: {kaavio: [...new Set(vari('.rp-stk .rpk-fuel'))], jakauma: vari('.rp-dbar .rpk-fuel'), rivi: [...new Set(vari('.rp-vlist .rpk-fuel'))], selite: vari('.rp-legend .rpk-fuel')},
    suodatin: [...document.querySelectorAll('.rp-stk .rpk-fuel, .rp-dbar .rpk-fuel, .rp-vlist .rpk-fuel')].map(e => getComputedStyle(e).filter).filter((v, i, a) => a.indexOf(v) === i),
    vienti: [!!document.querySelector('.rp-export [data-rp-pdf]'), !!document.querySelector('.rp-export [data-rp-csv]')]};}"""


@pytest.mark.parametrize("teema", [None, "dark"])
def test_yhteenvedon_rakenne(browser, base, teema):
    autot = talli() + [tiedot.auto("a4", name="Testi Tyhjä", plate="TST-204", km=50000)]
    s = avaa(browser, base, "reports", autot=autot, teema=teema, extra={"ajoura-reports": '{"p":"year","t":"sum"}'}, kello=KELLO)
    try:
        r = s.page.evaluate(YHT_JS)
        assert r["iso"] == "1265€" and "1.1.–29.10.2026" in r["ctx"] and "(4)" in r["ctx"], r
        assert "Keskimäärin / kk" in r["sec"][0] and "9,9 kk:n ajalta" in r["sec"][0], r  # 9 + 29/31 kk
        assert "Kustannus / km" in r["sec"][1], r
        assert "Muutosta ei näytetä" in r["chg"], r  # ei kirjauksia vertailujaksolta
        assert r["kk"] == 10 and r["osat"] == ["9"], r  # lokakuu kesken (29.10.)
        assert "Lokakuu 2026" in r["valittu"] and "keskeneräinen kuukausi" in r["valittu"], r
        assert r["rivisumma"] == 1265 and ["Testi Tyhjä", "–"] == r["rivit"][-1][:2], r
        assert "Ei kirjattuja kuluja valitulla ajanjaksolla." in r["rivit"][-1][2], r
        v = r["varit"]
        assert len(v["kaavio"]) == 1 and v["kaavio"] == v["rivi"] == v["jakauma"] == v["selite"], v
        assert len(r["suodatin"]) == 1, r  # tummassa tilassa kaikki värit palautetaan samalla tavalla
        assert r["vienti"] == [True, True], r
        s.page.click('.rp-col[data-rp-m="0"]'); s.page.wait_for_timeout(150)
        assert "Ei kirjattuja kuluja tänä kuukautena." in s.page.inner_text(".rp-msel")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_vienti_vastaa_nakymaa(browser, base):
    """CSV:n summat = Yhteenvedon kokonaiskulut samalla rajauksella (ajoneuvo ja jakso)."""
    s = avaa(browser, base, "reports", autot=talli(), mobiili=False, extra={"ajoura-reports": '{"p":"year","t":"sum","offCars":["a2"]}'}, kello=KELLO)
    try:
        iso = int("".join(ch for ch in s.page.inner_text(".rp-total .rp-big") if ch.isdigit()))
        with s.page.expect_download() as d:
            s.page.click("[data-rp-csv]")
        teksti = open(d.value.path(), encoding="utf-8-sig").read().splitlines()
        otsake = teksti[0].split(";")
        i = otsake.index("Summa (€)")
        summa = sum(float(r.split(";")[i].replace(",", ".") or 0) for r in teksti[1:])
        assert round(summa) == iso == 1265 - 190, (summa, iso)
        assert d.value.suggested_filename.endswith(".csv")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.79: Ajoneuvot-välilehti on vertailutyökalu samoilla suodattimilla kuin Yhteenveto: kokonaiskulut samalla asteikolla
# (lajeittain nimettyinä), €/km vain luotettavilla kilometreillä, kertyneet kulut samalla aika-akselilla ja jokaiselle
# ajoneuvolle avattava kortti (lajit nimineen, kuukaudet, kilometrit, €/km, muutos, raportit). Yhteenvedon ajoneuvorivi
# avaa saman ajoneuvon kortin. Ajoneuvon väri on sama täällä ja Tankkaus → Vertailussa.
AJ_JS = """() => {const v = document.querySelector('.rp-cmp'), nro = s => Number((s || '').replace(/[^0-9]/g, ''));
  return {vertailu: !!v, yksi: !!document.querySelector('.rp-one'),
    kokonais: v ? [...v.querySelectorAll('.rp-cr')].slice(0, document.querySelectorAll('.rp-vdet').length).map(c => [c.querySelector('.rp-crt span[translate]').textContent, nro(c.querySelector('.rp-crt b').textContent), c.querySelector('.rp-cks')?.innerText.replace(/\\s+/g, ' ') || c.innerText]) : [],
    km: v ? [...v.querySelectorAll('.rp-cr')].slice(document.querySelectorAll('.rp-vdet').length).map(c => [c.querySelector('.rp-crt b').textContent.replace(/\\s+/g, ' '), !!c.querySelector('.rp-kbar'), c.querySelector('.rp-cnone')?.textContent || '']) : [],
    kayra: document.querySelectorAll('.rp-cum polyline, .rp-cum circle').length,
    kortit: [...document.querySelectorAll('.rp-vdet')].map(d => [d.dataset.rpDet, d.open]),
    auki: [...document.querySelectorAll('.rp-vdet[open]')].map(d => d.innerText.replace(/\\s+/g, ' ')),
    varit: [...document.querySelectorAll('.rp-cmp .rp-crt .rp-vsw')].map(e => e.style.background)};}"""


def test_ajoneuvot_vertailu(browser, base):
    autot = talli()
    autot[0]["km"], autot[1]["km"], autot[2]["km"] = 149500, 99000, 60000  # nykyinen lukema = viimeisin kirjattu
    autot[1]["fuels"] = [T("v1", "2026-01-05", 84000, 40, 70), T("v2", "2026-10-20", 99000, 40, 70)]
    s = avaa(browser, base, "reports", autot=autot, extra={"ajoura-reports": '{"p":"year","t":"sum"}'}, kello=KELLO)
    try:
        s.page.click('[data-rp-open="a1"]'); s.page.wait_for_timeout(200)
        r = s.page.evaluate(AJ_JS)
        assert r["vertailu"] and not r["yksi"], r
        assert [x[:2] for x in r["kokonais"]] == [["Testi Pakettiauto", 1015], ["Testi Farmari", 330], ["Testi Asuntoauto", 60]], r
        assert "Korjaukset 496 €" in r["kokonais"][0][2].replace(" ", " "), r  # lajin nimi summan vieressä (0.53)
        # €/km: Pakettiautolla (tiedot alkavat 2.3., 1 015 € / 9 500 km) ja Farmarilla (5.1.) kilometrit ja kulut samalta ajalta → palkit;
        # Asuntoautolla vain yksi lukema → ei €/km:ää, syy kerrotaan (ei nollapalkkia).
        assert [x[0] for x in r["km"]] == ["0,11 €/km", "0,02 €/km", "–"] and [x[1] for x in r["km"]] == [True, True, False], r
        assert "mittarilukemat eivät kata" in r["km"][2][2], r
        assert r["kayra"] == 3, r
        assert ["a1", True] in r["kortit"] and ["a2", False] in r["kortit"], r
        auki = r["auki"][0].replace(" ", " ")
        assert "Korjaukset 496 €" in auki and "Huoltohistoriaraportti" in auki and "Tankkauskirja" in auki, auki
        assert "Ajetut kilometrit" in auki and "Muutos" not in auki or "vertailu" in auki.lower(), auki
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_ajoneuvot_yksi_ja_tyhja(browser, base):
    autot = talli() + [tiedot.auto("a4", name="Testi Tyhjä", plate="TST-204", km=50000)]
    s = avaa(browser, base, "reports", autot=autot, extra={"ajoura-reports": '{"p":"year","t":"cars","offCars":["a1","a2","a3"]}'}, kello=KELLO)
    try:
        r = s.page.evaluate(AJ_JS)
        assert not r["vertailu"] and r["yksi"] and r["kortit"] == [["a4", True]], r  # yksi ajoneuvo: ei teeskenneltyä vertailua
        assert "Puuttuva kirjaus ei tarkoita, että kuluja ei olisi ollut." in r["auki"][0], r
        assert "Huoltohistoriaraportti" in r["auki"][0], r
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_ajoneuvon_vari_sama(browser, base):
    autot = kuusi_autoa()
    s = avaa(browser, base, "reports", autot=autot, extra={"ajoura-reports": '{"p":"12","t":"cars"}'}, kello=KELLO)
    try:
        rp = {n: c for n, c in s.page.evaluate("""() => [...document.querySelectorAll('.rp-cmp .rp-crt')].map(p =>
            [p.querySelector('span[translate]').textContent, p.querySelector('.rp-vsw').style.background])""")}
        s.page.evaluate("localStorage.setItem('ajoura-fuel', '{\"p\":\"12\",\"t\":\"cmp\",\"m\":\"cost\"}')")
        s.page.goto(base + "/app.html#fuel"); s.page.wait_for_selector(".fl-bar")
        fl = {n: c for n, c in s.page.evaluate("""() => [...document.querySelectorAll('.fl-bar')].map(b =>
            [b.querySelector('.fl-bn').textContent, b.querySelector('.fl-btrack i').style.background])""")}
        assert fl and all(rp[n] == c for n, c in fl.items()), (rp, fl)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.80: jaksot Edellinen vuosi ja Mukautettu (Raportit) sekä Edellinen vuosi (Tankkaus); kaikki luvut, kaavio ja
# ajoneuvorivit päivittyvät. Valikon sininen kehys vain näppäimistökohdistuksessa, ei napautuksen jälkeen.
JAKSO_JS = """() => ({ctx: document.querySelector('.rp-total .rp-ctx')?.innerText || '', iso: document.querySelector('.rp-total .rp-big')?.textContent.replace(/\\s/g, ''),
  kk: document.querySelectorAll('.rp-col').length, osat: document.querySelectorAll('.rp-col.part').length,
  mukautettu: !!document.querySelector('[data-rp-custom]'), virhe: document.querySelector('[data-rp-custom] [role=alert]')?.textContent || '',
  prefs: JSON.parse(localStorage.getItem('ajoura-reports') || '{}')})"""


def test_jakso_edellinen_ja_mukautettu(browser, base):
    autot = talli()
    autot[0]["events"].append(M("x9", "Huolto", "2025-06-01", 130000, cost="300"))
    s = avaa(browser, base, "reports", autot=autot, extra={"ajoura-reports": '{"p":"year","t":"sum"}'}, kello=KELLO)
    pg = s.page
    try:
        pg.select_option("[data-rp-period]", "prev"); pg.wait_for_timeout(150)
        r = pg.evaluate(JAKSO_JS)
        assert "1.1.–31.12.2025" in r["ctx"] and r["iso"] == "300€" and r["kk"] == 12 and r["osat"] == 0, r
        pg.select_option("[data-rp-period]", "custom"); pg.wait_for_timeout(150)
        r = pg.evaluate(JAKSO_JS)
        assert r["mukautettu"] and r["prefs"]["p"] == "custom" and r["prefs"]["cf"] == "2025-10-01" and r["prefs"]["ct"] == "2026-10-29", r
        pg.fill("[data-rp-custom] [name=cf]", "2026-03-01"); pg.dispatch_event("[data-rp-custom] [name=cf]", "change"); pg.wait_for_timeout(150)
        pg.fill("[data-rp-custom] [name=ct]", "2026-05-31"); pg.dispatch_event("[data-rp-custom] [name=ct]", "change"); pg.wait_for_timeout(150)
        r = pg.evaluate(JAKSO_JS)
        assert "1.3.–31.5.2026" in r["ctx"] and r["iso"] == str(496 + 285 + 190) + "€" and r["kk"] == 3, r
        # Alku loppua myöhemmin: virhe, valinta ennallaan.
        pg.fill("[data-rp-custom] [name=cf]", "2026-06-15"); pg.dispatch_event("[data-rp-custom] [name=cf]", "change"); pg.wait_for_timeout(150)
        r = pg.evaluate(JAKSO_JS)
        assert "loppupäivän jälkeen" in r["virhe"] and r["prefs"]["cf"] == "2026-03-01", r
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tankkaus_edellinen_vuosi(browser, base):
    autot = talli()
    autot[0]["fuels"] = [T("g1", "2025-03-01", 120000, 50, 90), T("g2", "2025-04-01", 120800, 60, 108)]
    s = avaa(browser, base, "fuel/a1", autot=autot, extra={"ajoura-fuel": '{"p":"prev","t":"car"}'}, kello=KELLO)
    try:
        assert s.page.input_value("[data-fl-period]") == "prev"
        assert "198 €" in s.page.inner_text(".fl-sum").replace(" ", " ")
        assert "7,5" in s.page.inner_text(".fl-big")  # 60 l / 800 km
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


KEHYS_JS = "() => [...document.querySelectorAll('.rp-filters .rp-pick')].map(p => getComputedStyle(p).outlineStyle)"


@pytest.mark.parametrize("mobiili", [True, False])
def test_valikon_kehys_vain_nappaimistolla(browser, base, mobiili):
    s = avaa(browser, base, "reports", autot=talli(), extra=RP, mobiili=mobiili, kello=KELLO)
    pg = s.page
    try:
        # Valinnan jälkeen kohdistus palaa valikkoon (0.61), mutta kehystä ei näytetä (Niklaksen kuvassa pysyvä kehys).
        pg.click(".rp-cmenu>summary"); pg.click("[data-rp-car='a2']"); pg.wait_for_timeout(150)
        assert pg.evaluate(KEHYS_JS) == ["none", "none"], pg.evaluate(KEHYS_JS)
        if mobiili:  # tietokoneella ohjelmallinen valinta (select_option) vastaa näppäimistöä, joten kehys saa näkyä
            pg.select_option("[data-rp-period]", "all"); pg.wait_for_timeout(150)
            assert pg.evaluate(KEHYS_JS) == ["none", "none"], pg.evaluate(KEHYS_JS)
        if not mobiili:
            # Näppäimistö: kehys näkyy kohdistetussa valikossa.
            pg.evaluate("document.querySelector('.rp-cmenu>summary').focus()")
            pg.keyboard.press("Shift+Tab"); pg.keyboard.press("Tab")
            assert "solid" in pg.evaluate(KEHYS_JS), pg.evaluate(KEHYS_JS)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.81: Tankkaus → Vertailu mobiilissa: ajoneuvon koko nimi (ei katkaistu), puuttuva arvo "Ei tietoa" syineen ilman
# nollapalkkia, nimet kaavion selitteessä (ei katkaistuja nimiä viivojen päissä), yhteenveto riveinä ja kulujen summa.
VERT2_JS = """() => {const sc = document.querySelector('.screen-content'), b = sc.getBoundingClientRect();
  const katki = e => e.scrollWidth > e.clientWidth + 1 || getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth;
  return {palkit: [...document.querySelectorAll('.fl-bar')].map(r => [r.querySelector('.fl-bn span[translate]').textContent, !!r.querySelector('.fl-btrack'), r.querySelector('.fl-none, .fl-bv')?.innerText.replace(/\\s+/g, ' '), r.querySelector('.fl-why')?.textContent || '']),
    katkenneet: [...document.querySelectorAll('.fl-bn, .fl-srn span[translate], .fl-lgd span[translate]')].filter(katki).map(e => e.textContent),
    paat: document.querySelectorAll('.fl-chart .cend').length, selite: [...document.querySelectorAll('.fl-lgd span[translate]')].map(e => e.textContent),
    rivit: [...document.querySelectorAll('.fl-srows li')].map(l => l.innerText.replace(/\\s+/g, ' ')), yht: document.querySelector('.fl-stot')?.innerText.replace(/\\s+/g, ' '),
    yli: sc.scrollWidth - sc.clientWidth, taulukko: document.querySelectorAll('.fl-ctable').length};}"""


@pytest.mark.parametrize("kieli", ["fi", "sv"])
@pytest.mark.parametrize("leveys", [320, 390])
def test_tankkaus_vertailu_mobiilissa(browser, base, kieli, leveys):
    autot = kuusi_autoa()[:3]
    pitka = "Volkswagen Passat Variant 2.0 TDI Highline"
    autot[1]["name"] = pitka
    autot[0]["fuels"] = [T("f1", "2026-09-01", 148000, 60, 110)]  # yksi tankkaus: kulutusta ei voi laskea
    autot[2]["fuels"] = [T("q1", "2026-08-01", 60000, 40, 70), T("q2", "2026-09-01", 60600, 45, 80), T("q3", "2026-10-01", 61200, 44, 79)]
    s = avaa(browser, base, "fuel", autot=autot, kieli=kieli, leveys=leveys, extra={"ajoura-fuel": '{"p":"12","t":"cmp","m":"cons"}'}, kello=KELLO)
    try:
        r = s.page.evaluate(VERT2_JS)
        nimet = [x[0] for x in r["palkit"]]
        assert pitka in nimet and not r["katkenneet"] and r["yli"] <= 0, r
        puuttuu = next(x for x in r["palkit"] if x[0] == "Testi Pakettiauto")
        assert not puuttuu[1] and puuttuu[2] in ("Ei tietoa", "Ingen data") and puuttuu[3], r  # ei nollapalkkia, syy kerrottu
        assert r["paat"] == 0 and pitka in r["selite"] and "Testi Pakettiauto" not in r["selite"], r  # vain ajoneuvot, joilla on pisteitä
        assert len(r["rivit"]) == 3 and r["taulukko"] == 0 and "479" in r["yht"].replace("\u00a0", ""), r  # 110 + 140 + 229 €
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# 0.82: Raportit-PDF:ssä kuluton ajoneuvo on "–" kuten näytöllä (0.78), ei 0 €: puuttuva kirjaus ei ole nollakulu.
@pytest.mark.skipif(not __import__("shutil").which("pdftotext"), reason="pdftotext puuttuu")
def test_pdf_kuluton_ajoneuvo(browser, base, tmp_path):
    import subprocess
    autot = talli() + [tiedot.auto("a4", name="Testi Tyhjä", plate="TST-204", km=50000)]
    s = avaa(browser, base, "reports", autot=autot, mobiili=False, extra={"ajoura-reports": '{"p":"year","t":"sum"}'}, kello=KELLO)
    try:
        with s.page.expect_download() as d:
            s.page.click("[data-rp-pdf]")
        pdf = tmp_path / "kulut.pdf"; d.value.save_as(pdf)
        teksti = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True).stdout
        rivit = [r for r in teksti.splitlines() if "Testi Tyhjä" in r]
        assert len(rivit) == 2 and all("0 €" not in r and not r.rstrip().endswith(" 0") for r in rivit), rivit
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
