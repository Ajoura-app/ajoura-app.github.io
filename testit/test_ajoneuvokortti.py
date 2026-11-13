"""2.10: etusivun ajoneuvokortti hyväksytyn mallikuvan mukaan ja sama alavalikko kuin Tankkauksessa ja Raporteissa.

Kortissa on kuva-alue (rekisteritunnus, kilometrit, lisätietopainike ja huoltomittari), tekstilliset pikapainikkeet ja
kuluvan vuoden kulurivi. Toiminnot ovat samat kuin ennen; testi tarkistaa myös, ettei tallennettu talli muutu.
"""
import pytest

import tiedot
from apu import avaa, ikkuna_valmis, nykyinen_ajoneuvo, valitse_ajoneuvo

KELLO = '2026-11-11T12:00:00'
TEEMAT = ['nykyinen', 'dark']


def talli():
    autot = tiedot.talli()
    autot[0].update(events=[tiedot.merkinta('svc', 'Moottoriöljyn vaihto', '2026-08-20', 145600, cost='486'),
                            tiedot.merkinta('old', 'Huolto', '2025-08-20', 130600, cost='900')],
                    fuels=[tiedot.tankkaus('fill', '2026-10-01', 152400, 50, 1284.60)])
    return autot


def teema_avaimet(teema):
    return dict(teema='dark' if teema == 'dark' else None,
                extra={'ajoura-ulkoasu': 'nykyinen' if teema == 'dark' else teema})


def laatikko(locator):
    return locator.bounding_box()


def sisalla(sisa, ulko, vara=1):
    return (sisa['x'] >= ulko['x'] - vara and sisa['y'] >= ulko['y'] - vara
            and sisa['x'] + sisa['width'] <= ulko['x'] + ulko['width'] + vara
            and sisa['y'] + sisa['height'] <= ulko['y'] + ulko['height'] + vara)


def nav_tiedot(page):
    return page.evaluate("""() => {
      const n = document.querySelector('.tab-dock>.main-tabs'), r = n.getBoundingClientRect(), s = getComputedStyle(n);
      const a = [...n.querySelectorAll('a')].map(e => {const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)];});
      const fab = document.querySelector('.tab-dock>.tab-fab');
      return {x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), alas: Math.round(innerHeight - r.bottom),
              tausta: s.backgroundColor, kulma: s.borderRadius, reuna: s.borderTopColor, linkit: a,
              lisays: fab ? getComputedStyle(fab).display : 'none'};
    }""")


@pytest.mark.parametrize('teema', TEEMAT)
@pytest.mark.parametrize('leveys', [320, 390, 430])
def test_alavalikko_sama_kuin_tankkauksessa_ja_raporteissa(browser, base, teema, leveys):
    tulokset = {}
    for nakyma in ['home', 'fuel', 'reports']:
        s = avaa(browser, base, nakyma, autot=talli(), kello=KELLO, leveys=leveys, asennettu=True, ios=True,
                 **teema_avaimet(teema))
        try:
            tulokset[nakyma] = nav_tiedot(s.page)
            assert not s.virheet, s.virheet
        finally:
            s.sulje()
    koti, tankkaus, raportit = tulokset['home'], tulokset['fuel'], tulokset['reports']
    for avain in ['x', 'w', 'h', 'alas', 'tausta', 'kulma', 'reuna', 'linkit']:
        assert koti[avain] == tankkaus[avain] == raportit[avain], (avain, koti, tankkaus, raportit)
    assert all(w >= 44 and h >= 44 for w, h in koti['linkit'])
    # Ajoneuvon lisäys on etusivulla yläpalkin ＋-painikkeessa, ei toista kelluvaa painiketta.
    assert koti['lisays'] == 'none'


@pytest.mark.parametrize('teema', TEEMAT)
@pytest.mark.parametrize('leveys', [320, 390, 430])
def test_ajoneuvokortti_mallikuvan_mukaan(browser, base, teema, leveys):
    s = avaa(browser, base, 'home', autot=talli(), kello=KELLO, leveys=leveys, asennettu=True, ios=True,
             **teema_avaimet(teema))
    try:
        p = s.page
        ennen = s.talli()
        kortit = p.locator('.vehicle-home-card')
        assert kortit.count() == 3
        kortti = kortit.first
        jarjestys = kortti.evaluate('e=>[...e.children].map(x=>x.classList[0])')
        assert jarjestys == ['secretary-vehicle', 'secretary-actions', 'home-expenses', 'vehicle-panels']
        # Kortti on oma, pyöristetty pintansa.
        assert kortti.evaluate('e=>parseFloat(getComputedStyle(e).borderTopLeftRadius)') >= 20
        assert kortti.evaluate('e=>getComputedStyle(e).boxShadow') != 'none'

        kuva = laatikko(kortti.locator('.secretary-hero'))
        rekisteri = laatikko(kortti.locator('.secretary-hero-meta'))
        mittari = laatikko(kortti.locator('.home-service-pill'))
        lisaa = laatikko(kortti.locator('.vehicle-toggle-indicator'))
        assert sisalla(rekisteri, kuva) and sisalla(mittari, kuva) and sisalla(lisaa, kuva)
        # Rekisteri vasemmassa alakulmassa, huoltoprosentti oikeassa alakulmassa, lisätiedot oikeassa yläkulmassa.
        assert rekisteri['x'] - kuva['x'] < 30 and kuva['y'] + kuva['height'] - (rekisteri['y'] + rekisteri['height']) < 30
        assert kuva['x'] + kuva['width'] - (mittari['x'] + mittari['width']) < 30
        assert kuva['y'] + kuva['height'] - (mittari['y'] + mittari['height']) < 30
        assert lisaa['y'] - kuva['y'] < 30 and kuva['x'] + kuva['width'] - (lisaa['x'] + lisaa['width']) < 30
        assert rekisteri['x'] + rekisteri['width'] <= mittari['x'] + 1, 'rekisteritunnus ja prosentti päällekkäin'
        assert mittari['width'] >= 44 and mittari['height'] <= 40, 'prosentti pienenä merkkinä (2.12)'
        # Huoltokehys kiertää koko kuvan.
        kehys = laatikko(kortti.locator('.hero-progress'))
        assert abs(kehys['width'] - kuva['width']) < 2 and abs(kehys['height'] - kuva['height']) < 2
        meta = ' '.join(kortti.locator('.secretary-hero-meta').inner_text().split())
        assert 'TST-101' in meta and '152 400 km' in meta
        assert kortti.locator('.secretary-hero-meta .row-meta>span').first.evaluate(
            'e=>parseFloat(getComputedStyle(e).fontSize)') >= 24
        assert kortti.locator('.home-service-pill').evaluate('e=>getComputedStyle(e).color') == 'rgb(255, 255, 255)'

        painikkeet = kortti.locator('.secretary-actions>*')
        assert painikkeet.count() == 3
        assert [' '.join(x.split()) for x in painikkeet.all_inner_texts()] == ['Tankkaus', 'Huolto', 'Muistiinpanot']
        for painike in painikkeet.all():
            b = laatikko(painike)
            assert b['width'] >= 44 and b['height'] >= 44
            assert painike.locator('.secretary-action-icon').is_visible()
            nimi = painike.locator('.home-action-label')
            assert nimi.evaluate('e=>e.scrollWidth<=e.clientWidth'), 'painikkeen nimi katkeaa'
            assert nimi.evaluate('e=>e.getBoundingClientRect().height<parseFloat(getComputedStyle(e).fontSize)*1.7'), 'painikkeen nimi rivittyy'
            assert nimi.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)') >= 12
            assert painike.get_attribute('aria-label')
        assert painikkeet.nth(0).evaluate('e=>getComputedStyle(e).backgroundColor') == 'rgba(0, 0, 0, 0)'

        kulut = kortti.locator('.home-expenses')
        teksti = ' '.join(kulut.inner_text().split())
        assert all(arvo in teksti for arvo in ['Kulut 2026', '1 770,60 €', '1 284,60 €', '486,00 €'])
        assert '900,00' not in teksti
        assert kulut.evaluate('e=>getComputedStyle(e).backgroundColor') != 'rgba(0, 0, 0, 0)'
        raportti = laatikko(kulut.locator('[data-home-costs]'))
        assert raportti['width'] >= 44 and raportti['height'] >= 44
        assert sisalla(raportti, laatikko(kulut))
        for el in kulut.locator('.cost-total b, .cost-split dd').all():
            assert el.evaluate('e=>e.scrollWidth<=e.clientWidth+1'), el.inner_text()
        for el in kortti.locator('.home-expenses span, .home-expenses dd, .home-service-pill span').all():
            assert el.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)') >= 11

        assert kortti.locator('.vehicle-panels').is_hidden()
        assert p.evaluate('document.querySelector("#app-screen").scrollWidth<=document.querySelector("#app-screen").clientWidth')
        assert s.talli() == ennen
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


KEHYS_JS = """e => {const v = e.querySelector('.hero-progress-value'), d = getComputedStyle(v).strokeDasharray.split(/[ ,]+/).map(parseFloat);
  return {osuus: d[0] / v.getTotalLength(), vari: getComputedStyle(v).stroke};}"""


def test_huoltokehyksen_tilat(browser, base):
    """2.12: huollon tila kehyksenä kuvan ympärillä ja pienenä prosenttina oikeassa alakulmassa."""
    autot = talli()
    autot[1]['events'] = []  # ei huoltohistoriaa: ei kehystä eikä laskennallista prosenttia
    s = avaa(browser, base, 'home', autot=autot, kello=KELLO)
    try:
        p = s.page
        kortti = p.locator('.vehicle-home-card[data-car=tst1]')
        merkki = kortti.locator('.home-service-pill')
        assert merkki.inner_text().strip() == '55 %'
        assert merkki.get_attribute('aria-label') == 'Huolto kunnossa, 55 % huoltovälistä jäljellä'
        assert merkki.get_attribute('href') == '#vehicle/tst1'
        kehys = kortti.locator('.secretary-hero').evaluate(KEHYS_JS)
        assert abs(kehys['osuus'] - 0.55) < 0.02, kehys
        # Väri liukuu vihreästä punaiseen kuten alkuperäisen huoltonäkymän palkki.
        assert kehys['vari'] == p.evaluate("getComputedStyle(document.querySelector('.vehicle-home-card[data-car=tst1] .row-bar i')).backgroundColor"), kehys
        assert 'status-ok' in kortti.locator('.home-expenses').get_attribute('class')
        valitse_ajoneuvo(p, 'tst1')
        assert nykyinen_ajoneuvo(p).locator('.home-service-original .row-pct').inner_text() == '55 % jäljellä'

        puuttuu = p.locator('.vehicle-home-card[data-car=tst2]')
        assert puuttuu.locator('.hero-progress, .home-service-pill').count() == 0

        p.evaluate('AjouraApp.cars()[0].km=200000;AjouraApp.refresh()')
        kortti = p.locator('.vehicle-home-card[data-car=tst1]')
        merkki = kortti.locator('.home-service-pill')
        assert '%' not in merkki.inner_text() and merkki.locator('svg').count() == 1
        assert merkki.get_attribute('aria-label') == 'Huolto myöhässä'
        kehys = kortti.locator('.secretary-hero').evaluate(KEHYS_JS)
        assert kehys['osuus'] > 0.99 and kehys['vari'] == 'rgb(226, 85, 85)', kehys
        assert 'status-late' in kortti.locator('.home-expenses').get_attribute('class')
        assert not s.virheet, s.virheet
    finally:
        s.sulje()

def test_tumman_tilan_kuva_alue_on_tumma(browser, base):
    s = avaa(browser, base, 'home', autot=talli(), kello=KELLO, teema='dark')
    try:
        p = s.page
        kuva = p.locator('.vehicle-home-card .secretary-hero').first
        # Tumma tila kääntää näkymän värit; kuva-alue näytetään omissa väreissään tummaa taustaa vasten.
        assert 'invert(1)' in kuva.evaluate('e=>getComputedStyle(e).filter')
        assert kuva.evaluate('e=>getComputedStyle(e).backgroundColor') == 'rgb(42, 33, 26)'
        assert kuva.locator('.car-render').first.evaluate('e=>getComputedStyle(e).filter') == 'none'
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_kortin_toiminnot_sailyvat(browser, base):
    s = avaa(browser, base, 'home', autot=talli(), kello=KELLO, extra={})
    try:
        p = s.page
        ennen = s.talli()
        toinen = p.locator('.vehicle-home-card[data-car=tst2]')
        assert ' '.join(toinen.locator('.secretary-actions>button').inner_text().split()) == 'Lataus'
        assert toinen.locator('.secretary-actions>button').get_attribute('aria-label') == 'Lataus +, kirjaa käsin'
        toinen.locator('[data-secretary-mode=manual]').click()
        ikkuna_valmis(p)
        assert p.locator('#quickfuel-form').get_attribute('data-car') == 'tst2'
        p.keyboard.press('Escape')
        toinen.locator('[data-secretary-service]').click()
        p.wait_for_selector('#event-form')
        assert p.locator('#event-form').get_attribute('data-car') == 'tst2'
        p.go_back()
        p.wait_for_selector('.secretary-refined')
        p.locator('.vehicle-home-card[data-car=tst2] [data-secretary-note]').click()
        assert p.url.endswith('#notes/tst2')
        p.go_back()
        p.wait_for_selector('.secretary-refined')
        # Lisätietopainike avaa ja sulkee saman ajoneuvon paneelin.
        nappi = p.locator('.vehicle-home-card[data-car=tst2] [data-vehicle-toggle]')
        nappi.click()
        assert nappi.get_attribute('aria-expanded') == 'true'
        assert p.locator('.vehicle-home-card[data-car=tst2] .vehicle-panels').is_visible()
        assert p.locator('.vehicle-home-card[data-car=tst2] .vehicle-panels .home-expenses').count() == 0
        p.locator('.vehicle-home-card[data-car=tst2] [data-vehicle-toggle]').click()
        assert p.locator('.vehicle-home-card[data-car=tst2] .vehicle-panels').is_hidden()
        # Kulurivin linkit.
        assert p.locator('.vehicle-home-card[data-car=tst2] .cost-split a').first.get_attribute('href') == '#fuel/tst2'
        p.locator('.vehicle-home-card[data-car=tst2] [data-home-costs]').click()
        p.wait_for_function('location.hash==="#reports"')
        asetus = p.evaluate('JSON.parse(localStorage.getItem("ajoura-reports"))')
        assert asetus['car'] == 'tst2' and asetus['p'] == 'year'
        assert s.talli() == ennen
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_katsastushuomio_nakyy_kortissa(browser, base):
    autot = talli()
    autot[0]['events'].append(tiedot.merkinta('insp', 'Katsastus', '2024-01-01', 130000, cost='55'))
    s = avaa(browser, base, 'home', autot=autot, kello=KELLO)
    try:
        kortti = s.page.locator('.vehicle-home-card[data-car=tst1]')
        huomio = kortti.locator('.home-inspection-alert')
        assert huomio.is_visible()
        assert 'Katsastuksen määräpäivä tarkistettava.' in huomio.inner_text()
        assert huomio.get_attribute('href') == '#vehicle/tst1'
        assert s.page.locator('.vehicle-home-card[data-car=tst2] .home-inspection-alert').count() == 0
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def _luminanssi(c):
    f = lambda v: (v / 255) / 12.92 if v / 255 <= 0.04045 else ((v / 255 + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])


@pytest.mark.parametrize('teema', ['nykyinen', 'dark'])
@pytest.mark.parametrize('kuva', ['piirros', 'valkoinen-kuva'])
def test_kuvan_paalla_olevat_tekstit_luettavia(browser, base, teema, kuva):
    """Rekisteritunnus, kilometrit ja huoltomittari ovat valkoista tekstiä kuvan päällä. Kontrasti mitataan
    pikseleistä tekstin takaa (teksti piilotettuna), koska kuvan sävy ei näy tyylitiedoista. Vaalein 5 %
    tekstialueen pikseleistä ratkaisee: suuri teksti vähintään 3:1, muu teksti vähintään 4,5:1."""
    import io
    from PIL import Image
    autot = talli()
    if kuva == 'valkoinen-kuva':
        autot[0]['photo'] = tiedot.jpeg((250, 250, 245), koko=(800, 420))
    s = avaa(browser, base, 'home', autot=autot, kello=KELLO, leveys=320, **teema_avaimet(teema))
    try:
        p = s.page
        alueet = p.evaluate('''() => [...document.querySelectorAll('.vehicle-home-card .secretary-hero-meta .row-meta>span,'
          + ' .vehicle-home-card .home-service-pill>span')].map(e => {const r = e.getBoundingClientRect(), c = getComputedStyle(e);
          return {t: e.textContent.trim(), x: r.x, y: r.y, w: r.width, h: r.height,
                  iso: parseFloat(c.fontSize) >= 18.66 || (parseFloat(c.fontSize) >= 14 && +c.fontWeight >= 700)};})''')
        assert len(alueet) >= 5
        p.add_style_tag(content='.secretary-hero-meta,.secretary-hero-meta *,.home-service-pill,.home-service-pill *'
                                '{color:transparent!important;text-shadow:none!important}')
        p.wait_for_timeout(100)
        kuvakaappaus = Image.open(io.BytesIO(p.screenshot())).convert('RGB')
        virheet = []
        for a in alueet:
            osa = kuvakaappaus.crop((int(a['x'] * 2), int(a['y'] * 2), int((a['x'] + a['w']) * 2), int((a['y'] + a['h']) * 2)))
            arvot = sorted(_luminanssi(c) for c in (osa.get_flattened_data() if hasattr(osa, 'get_flattened_data') else osa.getdata()))
            kontrasti = 1.05 / (arvot[int(len(arvot) * 0.95)] + 0.05)
            if kontrasti < (3 if a['iso'] else 4.5):
                virheet.append((a['t'], round(kontrasti, 2)))
        assert not virheet, virheet
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize('leveys', [320, 390, 430])
def test_rekisteri_kiinni_vasemmassa_alakulmassa_ja_haivytetty(browser, base, leveys):
    """2.13 (Niklas): rekisteritunnus ei ole erillinen rajattu laatikko, vaan kiinni kuvan vasemmassa alakulmassa,
    ja sen tausta häivytetään kuvaan (oikea reuna ja yläreuna läpinäkyviä)."""
    s = avaa(browser, base, 'home', autot=talli(), kello=KELLO, leveys=leveys)
    try:
        kortti = s.page.locator('.vehicle-home-card').first
        kuva = laatikko(kortti.locator('.secretary-hero'))
        meta = kortti.locator('.secretary-hero-meta')
        r = laatikko(meta)
        assert abs(r['x'] - kuva['x']) < 1.5 and abs((r['y'] + r['height']) - (kuva['y'] + kuva['height'])) < 1.5, (r, kuva)
        tyyli = meta.evaluate('e=>{const c=getComputedStyle(e);return [c.borderTopRightRadius,c.backgroundImage,c.maskImage||c.webkitMaskImage]}')
        assert tyyli[0] == '0px', tyyli
        assert tyyli[1].startswith('linear-gradient(90deg') and tyyli[1].rstrip(')').endswith('rgba(20, 12, 6, 0) 100%'), tyyli
        assert tyyli[2].startswith('linear-gradient(rgba(0, 0, 0, 0)'), tyyli
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize('leveys', [320, 390, 430])
def test_kuvan_napautus_avaa_lisatiedot_rekisterin_vierestakin(browser, base, leveys):
    """2.13: rekisterin häivytetty tausta ei vie kuvan napautuksia; vain teksti avaa ajoneuvon sivun."""
    s = avaa(browser, base, 'home', autot=talli(), kello=KELLO, leveys=leveys)
    try:
        p = s.page
        kortti = p.locator('.vehicle-home-card').first
        kuva = laatikko(kortti.locator('.secretary-hero'))
        meta = laatikko(kortti.locator('.secretary-hero-meta'))
        teksti = laatikko(kortti.locator('.secretary-hero-meta .row-meta>span').first)
        # Kohdat: kuvan keskipiste ja häivytetyn alueen oikea reuna tekstin oikealla puolella.
        for x, y in [(kuva['x'] + kuva['width'] / 2, kuva['y'] + kuva['height'] / 2),
                     (min(meta['x'] + meta['width'] - 8, teksti['x'] + teksti['width'] + 20), teksti['y'] + teksti['height'] / 2)]:
            assert p.evaluate('([x,y])=>!!document.elementFromPoint(x,y).closest("[data-vehicle-toggle]")', [x, y]), (x, y)
        kortti.locator('[data-vehicle-toggle]').click()
        assert kortti.locator('.vehicle-panels').is_visible()
        kortti.locator('.secretary-hero-meta .row-meta>span').first.click()
        p.wait_for_function('location.hash==="#vehicle/tst1"')
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def _kortin_keski(page, tunniste):
    b = page.locator(f'.vehicle-home-card[data-car={tunniste}] .secretary-hero').bounding_box()
    return b['x'] + b['width'] / 2, b['y'] + b['height'] / 2


def test_kortin_siirto_pitkalla_painalluksella_kosketus(browser, base):
    """2.17 (Niklas): etusivun ajoneuvokortin voi siirtää painamalla kuvaa pitkään ja vetämällä. Järjestys tallentuu
    samaan tallin järjestykseen kuin Järjestä ajoneuvot -näkymässä; vapautus ei avaa lisätietoja."""
    s = avaa(browser, base, 'home', autot=talli(), korkeus=2600, kello=KELLO)
    p = s.page
    try:
        ennen = s.talli()
        assert [c['id'] for c in ennen['cars']] == ['tst1', 'tst2', 'tst3']
        cdp = p.context.new_cdp_session(p)
        kosketa = lambda tyyppi, x, y: cdp.send('Input.dispatchTouchEvent', {
            'type': tyyppi, 'touchPoints': [] if tyyppi == 'touchEnd' else [{'x': x, 'y': y, 'id': 1}]})
        x, y = _kortin_keski(p, 'tst1')
        _, y3 = _kortin_keski(p, 'tst3')
        kosketa('touchStart', x, y); p.wait_for_timeout(650)
        assert p.locator('.vehicle-home-card.dragging').count() == 1
        for i in range(1, 13):
            kosketa('touchMove', x, y + (y3 + 120 - y) * i / 12); p.wait_for_timeout(20)
        kosketa('touchEnd', 0, 0); p.wait_for_timeout(350)
        assert [c['id'] for c in s.talli()['cars']] == ['tst2', 'tst3', 'tst1']
        assert p.eval_on_selector_all('.vehicle-home-card', 'e=>e.map(x=>x.dataset.car)') == ['tst2', 'tst3', 'tst1']
        assert p.evaluate('location.hash') == '#home'
        assert p.locator('.vehicle-panels:not([hidden])').count() == 0, 'vapautus avasi lisätiedot'
        # Muut tiedot ennallaan: vain järjestys muuttui.
        jalkeen = s.talli()
        assert sorted(jalkeen['cars'], key=lambda c: c['id']) == sorted(ennen['cars'], key=lambda c: c['id'])
        p.reload(); p.wait_for_selector('.vehicle-home-card')
        assert p.eval_on_selector_all('.vehicle-home-card', 'e=>e.map(x=>x.dataset.car)') == ['tst2', 'tst3', 'tst1']
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_kortin_siirto_ei_hairitse_napautusta_vieritysta_tai_painikkeita(browser, base):
    s = avaa(browser, base, 'home', autot=talli(), korkeus=2600, mobiili=False, kello=KELLO)
    p = s.page
    try:
        # Liike ennen pitkää painallusta on vieritys: korttia ei nosteta.
        x, y = _kortin_keski(p, 'tst2')
        p.mouse.move(x, y); p.mouse.down(); p.mouse.move(x, y - 40); p.wait_for_timeout(650)
        assert p.locator('.vehicle-home-card.dragging').count() == 0
        p.mouse.up()
        # Pitkä painallus pikapainikkeessa ei nosta korttia.
        b = p.locator('.vehicle-home-card[data-car=tst2] [data-secretary-service]').bounding_box()
        p.mouse.move(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2); p.mouse.down(); p.wait_for_timeout(650)
        assert p.locator('.vehicle-home-card.dragging').count() == 0
        p.mouse.up(); p.goto(base + '/app.html#home'); p.wait_for_selector('.vehicle-home-card')
        # Lyhyt napautus kuvaan avaa tai sulkee lisätiedot kuten ennen (hiiren veto yllä on myös napautus).
        nappi = p.locator('.vehicle-home-card[data-car=tst2] [data-vehicle-toggle]')
        auki = nappi.get_attribute('aria-expanded') == 'true'
        nappi.click()
        assert p.locator('.vehicle-home-card[data-car=tst2] .vehicle-panels').is_visible() != auki
        assert [c['id'] for c in s.talli()['cars']] == ['tst1', 'tst2', 'tst3']
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
