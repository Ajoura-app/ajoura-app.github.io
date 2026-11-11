"""Visual-first 04: distinct materials, readable controls and preserved vehicle/character choices."""
from copy import deepcopy
import pytest

import tiedot
from apu import avaa, KELLO, avaa_tehtavat, kirjaa_avustajasta, valitse_ajoneuvo, ikkuna_valmis, nykyinen_ajoneuvo, avaa_ensimmainen_kortti, avaa_ajoneuvon_tiedot
from test_plus import PLUS, FREE_EI, TEKOALY, palvelu
from test_teemat import KONTRASTI

THEMES = ['garage', 'copilot', 'nordic', 'journey']


def test_teemat_erottuvat_myos_pintoina_ja_taustana(browser, base):
    art, materials, texts = [], [], []
    for theme in THEMES:
        s = avaa(browser, base, 'home', autot=tiedot.talli(), kello=KELLO,
                 extra={'ajoura-ulkoasu':theme})
        try:
            p = s.page
            before = s.talli()
            appearance = p.evaluate('''() => {
              const css=s=>getComputedStyle(document.querySelector(s));
              const hero=css('.secretary-hero'),card=css('.home-service');
              return {page:css('#app-screen').backgroundImage,hero:hero.backgroundImage,
                      card:[card.backgroundImage,card.borderColor,card.borderRadius]};
            }''')
            assert appearance['hero'] != 'none', (theme,appearance)
            assert appearance['page'] != 'none', (theme,appearance)
            art.append((appearance['page'],appearance['hero']))
            materials.append(tuple(appearance['card']))
            texts.append(p.inner_text('.secretary-home'))
            assert s.talli() == before
            assert not s.virheet, s.virheet
        finally:
            s.sulje()
    assert len(set(art)) == 4
    assert len(set(materials)) == 4
    assert len(set(texts)) == 1, 'Theme selection must not invent different tasks or content'


@pytest.mark.parametrize('theme', THEMES)
@pytest.mark.parametrize('width,height', [(320,568),(390,844),(430,932),(768,1024)])
def test_taide_ei_peita_ajoneuvoa_tai_paatoimintoja(browser, base, theme, width, height):
    s = avaa(browser, base, 'home', autot=tiedot.talli(), kello=KELLO,
             leveys=width, korkeus=height, asennettu=True, ios=True,
             extra={'ajoura-ulkoasu':theme})
    try:
        p = s.page
        before = s.talli()
        media = nykyinen_ajoneuvo(p).locator('.secretary-hero-media')
        for pseudo in ['::before','::after']:
            assert media.evaluate('(e,p)=>getComputedStyle(e,p).pointerEvents',pseudo) == 'none'
        assert nykyinen_ajoneuvo(p).locator('.secretary-hero-media :is(svg,img)').first.evaluate('(e)=>getComputedStyle(e).objectFit') == 'contain'
        assert p.locator('.assistant-widget img').get_attribute('src') == 'hahmot/emma.webp'
        if width == 390:
            dock = p.locator('.tab-dock').bounding_box()
            for action in nykyinen_ajoneuvo(p).locator('.secretary-actions > button,.secretary-actions > a').all():
                r = action.bounding_box()
                assert r['width'] >= 44 and r['height'] >= 44, (theme,r)
                action.scroll_into_view_if_needed()
                r=action.bounding_box()
                assert r['y'] + r['height'] <= dock['y'] + 1, (theme,r,dock)
        assert p.evaluate('document.querySelector("#app-screen").scrollWidth<=document.querySelector("#app-screen").clientWidth')
        valitse_ajoneuvo(p,'tst2')
        assert 'TST-202' in nykyinen_ajoneuvo(p).locator('.secretary-context').text_content()
        kirjaa_avustajasta(p,'manual')
        ikkuna_valmis(p)
        assert p.locator('#quickfuel-form').get_attribute('data-car') == 'tst2'
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize('theme', THEMES)
def test_myohassa_oleva_huolto_ja_puuttuva_taustakuva(browser, base, theme):
    cars = [tiedot.auto(events=[tiedot.merkinta('late','Huolto','2024-01-01',60000)])]
    s = avaa(browser, base, 'home', autot=cars, kello=KELLO,
             extra={'ajoura-ulkoasu':theme})
    try:
        p = s.page
        before = s.talli()
        assert p.locator('.status-late').is_visible()
        rows = p.evaluate(KONTRASTI)
        assert not [x for x in rows if x['k'] < 4.5], (theme,rows)
        p.route('**/ui-art/*.webp',lambda r:r.abort())
        p.reload()
        p.wait_for_selector('.secretary-cinematic')
        assert nykyinen_ajoneuvo(p).locator('.secretary-hero-meta').is_visible()
        assert nykyinen_ajoneuvo(p).locator('.secretary-hero-media svg').is_visible()
        kirjaa_avustajasta(p,'manual')
        ikkuna_valmis(p)
        assert p.locator('#quickfuel-form input[name=km]').is_visible()
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize('theme', THEMES)
@pytest.mark.parametrize('shape', [(800,160),(160,800)], ids=['wide','portrait'])
def test_oma_kuva_sailyy_kokonaisena_teemataiteen_edessa(browser, base, theme, shape):
    cars = tiedot.talli()
    cars[0]['photo'] = tiedot.jpeg(koko=shape)
    s = avaa(browser, base, 'home', autot=cars, kello=KELLO, leveys=320,
             extra={'ajoura-ulkoasu':theme})
    try:
        p = s.page
        before = s.talli()
        image = nykyinen_ajoneuvo(p).locator('.secretary-hero-media .car-photo img')
        assert image.get_attribute('src') == cars[0]['photo']
        assert image.evaluate('(e)=>e.complete && e.naturalWidth>0 && getComputedStyle(e).objectFit==="contain"')
        box, frame = image.bounding_box(), nykyinen_ajoneuvo(p).locator('.secretary-hero-media').bounding_box()
        assert box['x'] >= frame['x'] and box['x'] + box['width'] <= frame['x'] + frame['width']
        assert box['y'] >= frame['y'] and box['y'] + box['height'] <= frame['y'] + frame['height']
        assert nykyinen_ajoneuvo(p).locator('.secretary-hero-media .car-stage').count() == 0
        nykyinen_ajoneuvo(p).locator('.secretary-hero-meta').click()
        p.wait_for_function('location.hash==="#vehicle/tst1"')
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize('theme', THEMES)
@pytest.mark.parametrize('lang', ['fi','en','sv'])
def test_luettavuus_fokus_ja_suurennettu_teksti(browser, base, theme, lang):
    s = avaa(browser, base, 'home', autot=tiedot.talli(), kello=KELLO, leveys=320,
             kieli=lang, extra={'ajoura-ulkoasu':theme})
    try:
        p = s.page
        before = s.talli()
        avaa_ajoneuvon_tiedot(p)
        nykyinen_ajoneuvo(p).locator('.secretary-primary .task-details > summary').click()
        avaa_tehtavat(p)
        rows = p.evaluate(KONTRASTI)
        assert len(rows) > 25
        assert not [x for x in rows if x['k'] < 4.5], (theme,rows)
        summary = nykyinen_ajoneuvo(p).locator('.secretary-all-tasks > summary')
        summary.focus()
        assert summary.evaluate('(e)=>parseFloat(getComputedStyle(e).outlineWidth) >= 2')
        p.keyboard.press('Escape')
        assert summary.evaluate('(e)=>e===document.activeElement')
        p.evaluate('''()=>{const es=[...document.querySelectorAll('.secretary-home p,.secretary-home h3,.secretary-home h4,.secretary-home a,.secretary-home button,.secretary-home summary')];const sizes=es.map(e=>parseFloat(getComputedStyle(e).fontSize));es.forEach((e,i)=>e.style.fontSize=sizes[i]*2+'px')}''')
        assert p.evaluate('document.querySelector("#app-screen").scrollWidth<=document.querySelector("#app-screen").clientWidth')
        kirjaa_avustajasta(p,'manual')
        ikkuna_valmis(p)
        assert p.locator('#quickfuel-form input[name=km]').is_visible()
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize('theme', THEMES)
@pytest.mark.parametrize('state', ['quiet','free','quota','error'])
def test_hiljainen_estetty_ja_virhetila(browser, base, theme, state):
    s = avaa(browser, base, 'home', autot=[tiedot.auto()] if state=='quiet' else tiedot.talli(),
             kello=KELLO, leveys=320, extra={'ajoura-ulkoasu':theme,'ajoura-tekoaly':'0' if state=='quiet' else '1'})
    try:
        p = s.page
        rights = deepcopy(FREE_EI if state=='free' else PLUS)
        if state=='quota':rights['quota']['ai'].update(limit=30,used=30)
        cloud = palvelu(s,oikeus=rights,ai_status=503) if state!='quiet' else None
        if cloud:p.wait_for_function("AjouraAccess.check('ai.receipt').ok || AjouraAccess.check('ai.receipt').reason")
        before = s.talli()
        if state=='quiet':
            avaa_ajoneuvon_tiedot(p)
            assert nykyinen_ajoneuvo(p).locator('.secretary-task').count() == 0
            assert nykyinen_ajoneuvo(p).locator('.task-empty').is_visible()
        elif state in ['free','quota']:
            assert p.locator('[data-secretary-mode=photo],[data-secretary-mode=speech]').count() == 0
            kirjaa_avustajasta(p,'manual')
            ikkuna_valmis(p)
            assert cloud['ai'] == []
        else:
            pending=[]
            p.route(TEKOALY,lambda r:pending.append(r))
            kirjaa_avustajasta(p,'text')
            p.fill('#ai-say-in','45 l, 80 €, mittari 153000')
            with p.expect_request(TEKOALY):p.click('[data-ai-send]')
            assert p.locator('[data-ai-send]').is_disabled()
            assert p.locator('#ai-say-in').is_disabled()
            assert len(pending)==1
            assert pending[0].request.headers['x-ajoura-feature']=='ai.receipt'
            pending.pop().fulfill(status=503,content_type='application/json',body='{}')
            p.wait_for_function('!document.querySelector("[data-ai-send]").disabled')
            p.wait_for_selector('.ai-note:not([hidden])')
            assert p.locator('#ai-say-in').input_value()
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize('theme', THEMES)
def test_teeman_css_virhe_sailyttaa_luettavan_ja_toimivan_pinnan(browser, base, theme):
    s = avaa(browser, base, 'home', autot=tiedot.talli(), kello=KELLO,
             extra={'ajoura-ulkoasu':theme})
    try:
        p = s.page
        before = s.talli()
        p.route('**/teemat.css?*',lambda r:r.abort())
        p.reload()
        p.wait_for_selector('.vehicle-home-card')
        avaa_ensimmainen_kortti(p)
        assert nykyinen_ajoneuvo(p).locator('.secretary-intro [data-avatar-name]').inner_text() == 'Emma'
        kirjaa_avustajasta(p,'manual')
        ikkuna_valmis(p)
        assert p.locator('#quickfuel-form input[name=km]').is_visible()
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize('theme', THEMES)
def test_tuloste_sailyy_erillaan_teemataiteesta(browser, base, theme):
    s = avaa(browser, base, 'report/tst1', autot=tiedot.talli(), kello=KELLO,
             mobiili=False, leveys=1280, extra={'ajoura-ulkoasu':theme})
    try:
        p = s.page
        before = s.talli()
        p.emulate_media(media='print')
        assert 'TST-101' in p.locator('.report').inner_text()
        assert p.locator('.report').evaluate('(e)=>getComputedStyle(e).backgroundImage') == 'none'
        assert p.locator('#app-screen').evaluate('(e)=>getComputedStyle(e).backgroundImage') == 'none'
        assert p.pdf(format='A4').startswith(b'%PDF-')
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
