"""Visual-first phase 01: real image gestures, accessible selection and vehicle hero."""
import pytest
from apu import nykyinen_ajoneuvo, avaa_ensimmainen_kortti

import tiedot
from apu import avaa, KELLO, valitse_ajoneuvo, avaa_ajoneuvon_tiedot


@pytest.mark.parametrize('width,height', [(320, 568), (390, 844), (430, 932), (768, 1024)])
def test_hero_kuva_ja_ensimmainen_nakyma(browser, base, width, height):
    s = avaa(browser, base, 'home', autot=tiedot.talli(), kello=KELLO,
             leveys=width, korkeus=height, asennettu=True, ios=True,
             extra={})
    try:
        p = s.page
        avaa_ensimmainen_kortti(p)
        before = s.talli()
        hero = nykyinen_ajoneuvo(p).locator('.secretary-hero').bounding_box()
        media = nykyinen_ajoneuvo(p).locator('.secretary-hero-media').bounding_box()
        assert media['width'] >= hero['width'] * .9
        assert media['width'] * media['height'] >= hero['width'] * hero['height'] * .55
        assert nykyinen_ajoneuvo(p).locator('.row-info').inner_text().find('TST-101') >= 0
        assert nykyinen_ajoneuvo(p).locator('.secretary-vehicle-details').get_attribute('open') is None
        if width == 390:
            assert hero['height'] >= 190, hero
            dock = p.locator('.tab-dock').bounding_box()
            widget = p.locator('.assistant-widget').bounding_box()
            # 2.15: the assistant is part of the navigation dock.
            assert widget['y'] >= dock['y'] - 1, (widget, dock)
        assert p.evaluate('document.querySelector("#app-screen").scrollWidth <= document.querySelector("#app-screen").clientWidth')
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize('lang', ['fi', 'en', 'sv'])
def test_valitsimen_nappaimisto_ja_jarjestys(browser, base, lang):
    cars = [tiedot.auto(id=f'v{i}', plate=f'TST-{i + 101}',
                       nick=f'Pitkä fiktiivinen ajoneuvon nimi numero {i + 1}') for i in range(5)]
    s = avaa(browser, base, 'home', autot=cars, kello=KELLO, kieli=lang,
             leveys=320, extra={})
    try:
        p = s.page
        avaa_ensimmainen_kortti(p)
        before = s.talli()
        cars_data = cars
        cards = p.locator('.vehicle-home-card')
        assert cards.count() == 5
        assert cards.evaluate_all('(es)=>es.map(e=>e.dataset.car)') == [c['id'] for c in cars_data]
        second = cards.nth(1).locator('[data-vehicle-toggle]')
        second.focus()
        p.keyboard.press('Enter')
        assert second.get_attribute('aria-expanded') == 'true'
        assert 'TST-102' in cards.nth(1).locator('.secretary-hero-meta').text_content()
        assert second.evaluate('(e)=>e===document.activeElement')
        p.keyboard.press('Space')
        assert second.get_attribute('aria-expanded') == 'false'
        assert cards.nth(0).locator('[data-vehicle-toggle]').get_attribute('aria-expanded') == 'true'
        assert p.locator('[data-secretary-picker],.secretary-picker').count() == 0
        p.click('a[href="#car-order"]')
        p.wait_for_selector('.garage-rows .garage-row')
        assert p.locator('.garage-rows .garage-row').count() == 5
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def kosketa(cdp, x, y, dx, dy):
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
    for n in range(1, 6):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove',
                 'touchPoints': [{'x': x + dx * n / 5, 'y': y + dy * n / 5}]})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})


def test_pyyhkaisy_oikeasta_kuva_alueesta(browser, base):
    s = avaa(browser, base, 'home', autot=tiedot.talli(), kello=KELLO,
             asennettu=True, ios=True, extra={})
    try:
        p = s.page
        avaa_ensimmainen_kortti(p)
        before = s.talli()
        cdp = s.context.new_cdp_session(p)
        media = nykyinen_ajoneuvo(p).locator('.secretary-hero-media').bounding_box()
        x, y = media['x'] + media['width'] * .8, media['y'] + media['height'] / 2
        kosketa(cdp, x, y, -140, 0)
        assert 'TST-101' in nykyinen_ajoneuvo(p).locator('.secretary-hero-meta').text_content()
        kosketa(cdp, x, y, 5, -90)
        assert p.locator('[data-secretary-car]').count() == 0
        assert p.locator('.vehicle-home-card').count() == 3
        assert p.evaluate('location.hash') == '#home'
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize('variant', ['model', 'wide-photo', 'portrait-photo', 'boat', 'tractor', 'motorhome'])
def test_eri_ajoneuvojen_kuvat_ja_yksikot(browser, base, variant):
    c = tiedot.auto()
    if variant.endswith('photo'):
        c['photo'] = tiedot.jpeg(koko=(800, 160) if variant == 'wide-photo' else (160, 800))
    elif variant == 'boat':
        c = tiedot.talli()[2]
    elif variant == 'tractor':
        c.update(kind='tractor', body='farm', name='Testitraktori', plate='TST-303')
    elif variant == 'motorhome':
        c.update(body='motorhome', name='Testimatkailuauto')
    s = avaa(browser, base, 'home', autot=[c], kello=KELLO, leveys=320,
             extra={})
    try:
        p = s.page
        avaa_ensimmainen_kortti(p)
        before = s.talli()
        assert p.locator('.secretary-picker').count() == 0
        graphics = nykyinen_ajoneuvo(p).locator('.secretary-hero-media img, .secretary-hero-media svg')
        assert graphics.count() > 0
        for graphic in graphics.all():
            assert graphic.evaluate('(e) => getComputedStyle(e).objectFit') == 'contain'
            assert graphic.evaluate('(e) => e.tagName.toLowerCase() !== "img" || (e.complete && e.naturalWidth > 0)')
            box, frame = graphic.bounding_box(), nykyinen_ajoneuvo(p).locator('.secretary-hero-media').bounding_box()
            assert frame['x'] - 1 <= box['x'] and box['x'] + box['width'] <= frame['x'] + frame['width'] + 1
            assert frame['y'] - 1 <= box['y'] and box['y'] + box['height'] <= frame['y'] + frame['height'] + 1
        if variant in ['boat', 'tractor']:
            assert ' h' in nykyinen_ajoneuvo(p).locator('.row-meta').inner_text()
        avaa_ajoneuvon_tiedot(p)
        assert nykyinen_ajoneuvo(p).locator(':scope > .secretary-actions > *').count() == 3
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_heron_pitka_teksti_ja_kaksinkertainen_tekstikoko(browser, base):
    cars = tiedot.talli()
    cars[0]['nick'] = 'Fiktiivinen erittäin pitkä ajoneuvon nimi <img src=x onerror=alert(1)>'
    s = avaa(browser, base, 'home', autot=cars, kello=KELLO, leveys=320,
             extra={})
    try:
        p = s.page
        avaa_ensimmainen_kortti(p)
        assert nykyinen_ajoneuvo(p).locator('.secretary-hero-meta img').count() == 0
        assert '<img' in nykyinen_ajoneuvo(p).locator('.secretary-hero-meta').text_content()
        p.evaluate('''() => {
          for (const e of document.querySelectorAll('.secretary-hero .row-name strong, .secretary-hero .row-meta, .secretary-vehicle-details summary, .secretary-picker summary')) {
            e.style.fontSize = parseFloat(getComputedStyle(e).fontSize) * 2 + 'px';
          }
        }''')
        avaa_ajoneuvon_tiedot(p)
        assert p.evaluate('document.querySelector("#app-screen").scrollWidth <= document.querySelector("#app-screen").clientWidth')
        for button in nykyinen_ajoneuvo(p).locator(':scope > .secretary-actions > *').all():
            button.scroll_into_view_if_needed()
            assert button.bounding_box()['height'] >= 44
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
