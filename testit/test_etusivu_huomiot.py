"""Visual-first 03: two real observations, accessible task details and a compact home dock."""
import pytest

import tiedot
from apu import avaa, KELLO, valitse_ajoneuvo, avaa_kirjausvaihtoehdot, nykyinen_ajoneuvo, avaa_ajoneuvon_tiedot
from test_havainnot import car as consumption_car


def kolme_tehtavaa():
    car = consumption_car()
    car['events'].append(tiedot.merkinta('i', 'Katsastus', '2025-11-15', 88000))
    return [car]


@pytest.mark.parametrize('lang', ['fi', 'en', 'sv'])
@pytest.mark.parametrize('width', [320, 390])
def test_yksi_tarkein_ja_nappaimistolla_avattavat_tehtavat(browser, base, lang, width):
    s = avaa(browser, base, 'home', autot=kolme_tehtavaa(), kieli=lang, kello=KELLO,
             leveys=width, extra={})
    try:
        p = s.page
        avaa_ajoneuvon_tiedot(p)
        before = s.talli()
        tasks = nykyinen_ajoneuvo(p).locator('[data-task-key]')
        assert tasks.count() == 3
        # 2.11: one featured task (the two-task cinematic layout belonged to the removed themes).
        assert p.locator('[data-task-key]:visible').count() == 1
        assert ':Huolto:' in nykyinen_ajoneuvo(p).locator('.secretary-primary').get_attribute('data-task-key')
        assert p.locator('.secretary-primary .task-reason').is_visible()
        assert p.locator('.secretary-summary').count() == 0
        summary = nykyinen_ajoneuvo(p).locator('.secretary-all-tasks > summary')
        summary.focus()
        p.keyboard.press('Enter')
        assert p.locator('[data-task-key]:visible').count() == 3
        p.evaluate('AjouraApp.refresh()')
        assert p.locator('[data-task-key]:visible').count() == 3
        p.locator('.secretary-task-list .task-details > summary').last.focus()
        p.keyboard.press('Escape')
        assert nykyinen_ajoneuvo(p).locator('.secretary-all-tasks').get_attribute('open') is None
        assert summary.evaluate('(e) => e === document.activeElement')
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_siirto_ohitus_palautus_ja_ajoneuvon_vaihto(browser, base):
    s = avaa(browser, base, 'home', autot=kolme_tehtavaa() + [tiedot.auto(id='other')],
             kello=KELLO, leveys=320, extra={})
    try:
        p = s.page
        avaa_ajoneuvon_tiedot(p)
        before = s.talli()
        for action in ['later', 'dismiss', 'dismiss']:
            primary = nykyinen_ajoneuvo(p).locator('.secretary-primary')
            key = primary.get_attribute('data-task-key')
            primary.locator('.task-details > summary').click()
            primary.locator(f'[data-task-{action}]').click()
            assert p.locator(f'[data-task-key="{key}"]').count() == 0
            assert nykyinen_ajoneuvo(p).locator('[data-task-focus]').first.evaluate('(e) => e === document.activeElement')
        assert nykyinen_ajoneuvo(p).locator('.task-empty').is_visible()
        p.reload()
        p.wait_for_selector('.vehicle-home-card')
        avaa_ajoneuvon_tiedot(p)
        nykyinen_ajoneuvo(p).locator('.task-empty').wait_for()
        nykyinen_ajoneuvo(p).locator('.secretary-all-tasks > summary').click()
        nykyinen_ajoneuvo(p).locator('[data-task-reset]').click()
        assert nykyinen_ajoneuvo(p).locator('[data-task-key]').count() == 3
        assert nykyinen_ajoneuvo(p).locator('.secretary-all-tasks').get_attribute('open') is not None
        valitse_ajoneuvo(p, 'other')
        avaa_ajoneuvon_tiedot(p)
        assert nykyinen_ajoneuvo(p).locator('.task-empty').is_visible()
        assert nykyinen_ajoneuvo(p).locator('.secretary-all-tasks').get_attribute('open') is None
        valitse_ajoneuvo(p, 'tst1')
        assert nykyinen_ajoneuvo(p).locator('.secretary-all-tasks').get_attribute('open') is not None
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_todellinen_vertailu_ja_ennusteen_perustelu_sailyvat(browser, base):
    s = avaa(browser, base, 'home', autot=[consumption_car()], kello=KELLO,
             leveys=320, extra={})
    try:
        p = s.page
        avaa_ajoneuvon_tiedot(p)
        before = s.talli()
        nykyinen_ajoneuvo(p).locator('.secretary-all-tasks > summary').click()
        note = p.locator('[data-task-key*="consumption"]')
        assert '10.0 → 14.0 l/100 km' in note.locator('.task-reason').inner_text()
        note.locator('.task-details > summary').click()
        assert 'Ajotapa ja olosuhteet' in note.inner_text()
        service = p.locator('[data-task-key*="Huolto"]')
        service.locator('.task-details > summary').click()
        assert '180 päivän' in service.inner_text()
        assert 'Tarkista myös huollon päiväraja.' in service.inner_text()
        note.locator('a').click()
        p.wait_for_function('location.hash === "#fuel/tst1"')
        assert p.url.endswith('#fuel/tst1')
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize('lang', ['fi', 'en', 'sv'])
def test_hiljainen_tila_ja_suurennettu_teksti(browser, base, lang):
    s = avaa(browser, base, 'home', autot=[tiedot.auto()], kello=KELLO, kieli=lang,
             leveys=320, extra={})
    try:
        p = s.page
        avaa_ajoneuvon_tiedot(p)
        before = s.talli()
        assert p.locator('.secretary-task').count() == 0
        assert nykyinen_ajoneuvo(p).locator('.task-empty').is_visible()
        assert nykyinen_ajoneuvo(p).locator('.task-empty').evaluate('(e) => parseFloat(getComputedStyle(e).borderTopWidth) === 0')
        nykyinen_ajoneuvo(p).locator('.secretary-all-tasks > summary').click()
        p.evaluate('''() => {
          const els = [...document.querySelectorAll('.secretary-tasks p,.secretary-tasks h4,.secretary-tasks summary,.secretary-tasks button,.secretary-tasks a')];
          const sizes = els.map(e => parseFloat(getComputedStyle(e).fontSize));
          els.forEach((e,i) => e.style.fontSize = sizes[i] * 2 + 'px');
        }''')
        reset = nykyinen_ajoneuvo(p).locator('[data-task-reset]')
        reset.click()
        assert p.locator('.secretary-task').count() == 0
        assert p.evaluate('document.querySelector("#app-screen").scrollWidth <= document.querySelector("#app-screen").clientWidth')
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize('width,height', [(320,568), (390,844), (430,932), (768,1024)])
@pytest.mark.parametrize('safe', [0, 34])
def test_tiivis_alareuna_ei_peita_sisaltoa(browser, base, width, height, safe):
    s = avaa(browser, base, 'home', autot=kolme_tehtavaa(), kello=KELLO,
             leveys=width, korkeus=height, asennettu=True, ios=True,
             extra={})
    try:
        p = s.page
        avaa_ajoneuvon_tiedot(p)
        if safe:
            s.context.new_cdp_session(p).send('Emulation.setSafeAreaInsetsOverride',
                                            {'insets': {'top': 47, 'bottom': safe}})
        dock = p.locator('.tab-dock').bounding_box()
        # 2.10: the same navigation as Tankkaus and Raportit (tablet scale 1.3 included) stays compact;
        # 2.15: plus room for the raised assistant button in the middle.
        assert dock['height'] <= 84 + 26 + safe, dock
        controls = p.locator('.main-tabs a:visible')
        assert controls.count() == 4
        boxes = [x.bounding_box() for x in controls.all()]
        for i, a in enumerate(boxes):
            assert min(a['width'], a['height']) >= 44, a
            assert a['x'] >= 0 and a['x'] + a['width'] <= width
            # 2.10: same placement as on Tankkaus (0.74: the capsule sits close to the bottom edge, at most 12 px
            # into the iPhone home-indicator area).
            assert a['y'] >= dock['y'] and a['y'] + a['height'] <= height - max(0, safe - 12)
            for b in boxes[i + 1:]:
                assert a['x'] + a['width'] <= b['x'] or b['x'] + b['width'] <= a['x'] or a['y'] + a['height'] <= b['y'] or b['y'] + b['height'] <= a['y'], (a,b)
        nykyinen_ajoneuvo(p).locator('.secretary-all-tasks > summary').click()
        p.evaluate('document.querySelector("#app-screen").scrollTop = document.querySelector("#app-screen").scrollHeight')
        gap = p.locator('.tab-dock').bounding_box()['y'] - p.locator('.secretary-home').bounding_box()['y'] - p.locator('.secretary-home').bounding_box()['height']
        assert 0 <= gap <= 140, gap  # content reserves space for the 84 px floating widget
        assert p.evaluate('document.querySelector("#app-screen").scrollWidth <= document.querySelector("#app-screen").clientWidth')
        p.locator('.cinematic-brand a[href="#newcar"]').click()
        p.wait_for_function('location.hash === "#newcar"')
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize('lang', ['fi', 'en', 'sv'])
def test_pitkat_perustelut_ja_kaksinkertainen_teksti(browser, base, lang):
    s = avaa(browser, base, 'home', autot=kolme_tehtavaa(), kello=KELLO, kieli=lang,
             leveys=320, extra={})
    try:
        p = s.page
        avaa_ajoneuvon_tiedot(p)
        before = s.talli()
        nykyinen_ajoneuvo(p).locator('.secretary-all-tasks > summary').click()
        for summary in p.locator('.task-details > summary').all():
            summary.click()
        p.evaluate('''() => {
          const els = [...document.querySelectorAll('.secretary-tasks h4,.secretary-tasks p,.secretary-tasks summary,.secretary-tasks a,.secretary-tasks button')];
          const sizes = els.map(e => parseFloat(getComputedStyle(e).fontSize));
          els.forEach((e,i) => e.style.fontSize = sizes[i] * 2 + 'px');
        }''')
        assert p.evaluate('document.querySelector("#app-screen").scrollWidth <= document.querySelector("#app-screen").clientWidth')
        for body in p.locator('.task-detail-body').all():
            assert body.evaluate('(e) => e.scrollHeight <= e.clientHeight + 1')
        panel = p.locator('.task-details').last
        panel.locator('summary').focus()
        p.keyboard.press('Escape')
        assert panel.get_attribute('open') is None
        assert nykyinen_ajoneuvo(p).locator('.secretary-all-tasks').get_attribute('open') is not None
        p.keyboard.press('Enter')
        panel.locator('[data-task-dismiss]').click()
        assert nykyinen_ajoneuvo(p).locator('[data-task-key]').count() == 2
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize('lang', ['fi', 'en', 'sv'])
@pytest.mark.parametrize('theme', ['nykyinen'])
def test_kirjoitus_ei_siirra_painiketta_kesken_napautuksen(browser, base, lang, theme):
    s = avaa(browser, base, 'home', autot=tiedot.talli(), kello=KELLO, kieli=lang,
             leveys=320, asennettu=True, ios=True, extra={'ajoura-ulkoasu': theme})
    try:
        p = s.page
        avaa_ajoneuvon_tiedot(p)
        p.add_init_script('window.__calls=0;window.AjouraAssistantFixtureTransport={fixture:true,ready:()=>true,request:async()=>{window.__calls++;return {status:503}}}')
        p.reload()
        p.wait_for_selector('.vehicle-home-card')
        avaa_kirjausvaihtoehdot(p)
        nykyinen_ajoneuvo(p).locator('[data-assistant-opt]').check()
        before = s.talli()
        dock_height = p.locator('.tab-dock').evaluate('(e) => e.getBoundingClientRect().height')
        nykyinen_ajoneuvo(p).locator('.assistant-local input[type=text]').fill('kulutus')
        assert not p.locator('.tab-dock').is_visible()
        assert p.locator('.tab-dock').evaluate('(e) => e.getBoundingClientRect().height') == dock_height
        nykyinen_ajoneuvo(p).locator('[data-assistant-send]').click()
        p.wait_for_function('window.__calls === 1')
        assert nykyinen_ajoneuvo(p).locator('.assistant-local-result').inner_text()
        assert p.locator('.tab-dock').is_visible()
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
