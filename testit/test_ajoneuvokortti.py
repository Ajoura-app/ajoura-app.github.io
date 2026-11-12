"""2.10: etusivun ajoneuvokortti hyväksytyn mallikuvan mukaan ja sama alavalikko kuin Tankkauksessa ja Raporteissa.

Kortissa on kuva-alue (rekisteritunnus, kilometrit, lisätietopainike ja huoltomittari), tekstilliset pikapainikkeet ja
kuluvan vuoden kulurivi. Toiminnot ovat samat kuin ennen; testi tarkistaa myös, ettei tallennettu talli muutu.
"""
import pytest

import tiedot
from apu import avaa, ikkuna_valmis, nykyinen_ajoneuvo, valitse_ajoneuvo

KELLO = '2026-11-11T12:00:00'
TEEMAT = ['nykyinen', 'dark', 'garage', 'copilot', 'nordic', 'journey', 'blue-track', 'premium']


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
        mittari = laatikko(kortti.locator('.home-service-ring'))
        lisaa = laatikko(kortti.locator('.vehicle-toggle-indicator'))
        assert sisalla(rekisteri, kuva) and sisalla(mittari, kuva) and sisalla(lisaa, kuva)
        # Rekisteri vasemmassa alakulmassa, mittari oikeassa alakulmassa, lisätiedot oikeassa yläkulmassa.
        assert rekisteri['x'] - kuva['x'] < 30 and kuva['y'] + kuva['height'] - (rekisteri['y'] + rekisteri['height']) < 30
        assert kuva['x'] + kuva['width'] - (mittari['x'] + mittari['width']) < 30
        assert kuva['y'] + kuva['height'] - (mittari['y'] + mittari['height']) < 30
        assert lisaa['y'] - kuva['y'] < 30 and kuva['x'] + kuva['width'] - (lisaa['x'] + lisaa['width']) < 30
        assert rekisteri['x'] + rekisteri['width'] <= mittari['x'] + 1, 'rekisteritunnus ja mittari päällekkäin'
        assert mittari['width'] >= 80 and abs(mittari['width'] - mittari['height']) < 1
        meta = ' '.join(kortti.locator('.secretary-hero-meta').inner_text().split())
        assert 'TST-101' in meta and '152 400 km' in meta
        assert kortti.locator('.secretary-hero-meta .row-meta>span').first.evaluate(
            'e=>parseFloat(getComputedStyle(e).fontSize)') >= 24
        assert kortti.locator('.home-service-ring').evaluate('e=>getComputedStyle(e).color') == 'rgb(255, 255, 255)'

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
        for el in kortti.locator('.home-expenses span, .home-expenses dd, .ring-text span').all():
            assert el.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)') >= 11

        assert kortti.locator('.vehicle-panels').is_hidden()
        assert p.evaluate('document.querySelector("#app-screen").scrollWidth<=document.querySelector("#app-screen").clientWidth')
        assert s.talli() == ennen
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_huoltomittarin_tilat(browser, base):
    autot = talli()
    autot[1]['events'] = []  # ei huoltohistoriaa: ei laskennallista prosenttia
    s = avaa(browser, base, 'home', autot=autot, kello=KELLO)
    try:
        p = s.page
        kunnossa = p.locator('.vehicle-home-card[data-car=tst1] .home-service-ring')
        assert ' '.join(kunnossa.inner_text().split()) == '55 % Huolto kunnossa'
        assert kunnossa.get_attribute('aria-label') == 'Huolto kunnossa, 55 % huoltovälistä jäljellä'
        assert kunnossa.locator('.ring-mark-check').count() == 1
        assert kunnossa.get_attribute('href') == '#vehicle/tst1'
        assert 'status-ok' in p.locator('.vehicle-home-card[data-car=tst1] .home-expenses').get_attribute('class')
        # Sama prosentti kuin alkuperäisessä huoltonäkymässä.
        valitse_ajoneuvo(p, 'tst1')
        assert nykyinen_ajoneuvo(p).locator('.home-service-original .row-pct').inner_text() == '55 % jäljellä'

        puuttuu = p.locator('.vehicle-home-card[data-car=tst2] .home-service-ring')
        assert ' '.join(puuttuu.inner_text().split()) == 'Huoltohistoria puuttuu'
        assert '%' not in puuttuu.inner_text()
        assert puuttuu.locator('.ring-mark-calendar').count() == 1

        p.evaluate('AjouraApp.cars()[0].km=200000;AjouraApp.refresh()')
        myohassa = p.locator('.vehicle-home-card[data-car=tst1] .home-service-ring')
        assert ' '.join(myohassa.inner_text().split()) == 'Huolto myöhässä'
        assert '%' not in myohassa.inner_text()
        assert myohassa.locator('.ring-mark-alert').count() == 1
        assert 'status-late' in p.locator('.vehicle-home-card[data-car=tst1] .home-expenses').get_attribute('class')
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
    s = avaa(browser, base, 'home', autot=talli(), kello=KELLO, extra={'ajoura-ulkoasu': 'garage'})
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
          + ' .vehicle-home-card .ring-text>*')].map(e => {const r = e.getBoundingClientRect(), c = getComputedStyle(e);
          return {t: e.textContent.trim(), x: r.x, y: r.y, w: r.width, h: r.height,
                  iso: parseFloat(c.fontSize) >= 18.66 || (parseFloat(c.fontSize) >= 14 && +c.fontWeight >= 700)};})''')
        assert len(alueet) >= 6
        p.add_style_tag(content='.secretary-hero-meta,.secretary-hero-meta *,.ring-text,.ring-text *'
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
