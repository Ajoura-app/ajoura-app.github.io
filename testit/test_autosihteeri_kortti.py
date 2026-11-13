"""Visual-first 02: original cinematic avatars, supported actions and confirmation boundaries."""
from copy import deepcopy

import pytest
from apu import nykyinen_ajoneuvo, avaa_ensimmainen_kortti
import tiedot
from apu import avaa, KELLO, valitse_ajoneuvo, avaa_kirjausvaihtoehdot, kirjaa_avustajasta, ikkuna_valmis
from test_plus import PLUS, FREE_EI, palvelu


@pytest.mark.parametrize('character', ['emma', 'mikko', 'ankka'])
@pytest.mark.parametrize('ai', [False, True])
@pytest.mark.parametrize('width,height', [(390, 844), (320, 568)])
def test_kompakti_kortti_ja_alkuperaiset_hahmot(browser, base, character, ai, width, height):
    s = avaa(browser, base, 'home', autot=tiedot.talli(), kello=KELLO,
             leveys=width, korkeus=height, asennettu=True, ios=True,
             extra={'ajoura-hahmo':character, 'ajoura-tekoaly':'1' if ai else '0'})
    try:
        p = s.page
        avaa_ensimmainen_kortti(p)
        cloud = palvelu(s, oikeus=PLUS) if ai else None
        avaa_ensimmainen_kortti(p)
        if ai:
            p.wait_for_function("AjouraAccess.check('ai.receipt').ok")
        before = s.talli()
        assert nykyinen_ajoneuvo(p).locator('.secretary-card').count() == 1
        assert nykyinen_ajoneuvo(p).locator('.secretary-actions > button, .secretary-actions > a').count() == 3
        assert nykyinen_ajoneuvo(p).locator('.secretary-more').get_attribute('open') is None
        card = nykyinen_ajoneuvo(p).locator('.secretary-card').bounding_box()
        img = p.locator('.assistant-widget img')
        assert img.get_attribute('src') == f'hahmot/{character}.webp'
        assert img.evaluate('(e)=>e.complete&&e.naturalWidth===512&&getComputedStyle(e).objectFit==="contain"&&getComputedStyle(e).transform==="none"')
        frame = p.locator('.assistant-widget [data-avatar]').bounding_box()
        actual = img.bounding_box()
        assert frame['width'] == 64
        assert abs(actual['width'] - frame['width']) <= 1 and abs(actual['height'] - frame['height']) <= 1
        # 2.14 (Niklas): no assistant label, name, greeting or note on the home screen.
        assert nykyinen_ajoneuvo(p).locator('.secretary-intro, [data-avatar-name], .secretary-message, .secretary-note').count() == 0
        assert 'AUTOSIHTEERI' not in nykyinen_ajoneuvo(p).inner_text().upper()
        if width == 390:
            assert card['height'] > 0 and card['width'] <= width, card
            dock = p.locator('.tab-dock').bounding_box()
            for action in nykyinen_ajoneuvo(p).locator('.secretary-actions > button, .secretary-actions > a').all():
                box = action.bounding_box()
                assert 44 <= box['height'] <= 80, box
                assert box['y'] + box['height'] <= dock['y'], (box, dock)
        assert p.evaluate('document.querySelector("#app-screen").scrollWidth<=document.querySelector("#app-screen").clientWidth')
        assert before == s.talli()
        if cloud:
            assert cloud['ai'] == []
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize('mode', ['speech', 'text-only', 'ai-off', 'free', 'quota'])
def test_toiminnot_oikeuksien_ja_puhetuen_mukaan(browser, base, mode):
    s = avaa(browser, base, 'home', autot=tiedot.talli(), kello=KELLO,
             extra={'ajoura-tekoaly':'0' if mode == 'ai-off' else '1'})
    try:
        p = s.page
        avaa_ensimmainen_kortti(p)
        if mode == 'text-only':
            p.add_init_script('delete window.SpeechRecognition;delete window.webkitSpeechRecognition;')
        elif mode == 'speech':
            from test_mikrofoni import KEKSITTY_PUHE
            p.add_init_script(KEKSITTY_PUHE)
        rights = deepcopy(FREE_EI if mode == 'free' else PLUS)
        if mode == 'quota':
            rights['quota']['ai'].update(limit=1, used=1)
        cloud = palvelu(s, oikeus=rights)
        avaa_ensimmainen_kortti(p)
        before = s.talli()
        if mode in ['speech', 'text-only']:
            p.wait_for_function("AjouraAccess.check('ai.receipt').ok")
            primary = nykyinen_ajoneuvo(p).locator('.secretary-actions [data-secretary-mode]').evaluate_all('(els)=>els.map(e=>e.dataset.secretaryMode)')
            assert primary == ['manual']
            assert p.locator('[data-home-mic]').is_visible()
            assert nykyinen_ajoneuvo(p).locator('.secretary-more [data-secretary-mode=photo]').count()==1
            assert nykyinen_ajoneuvo(p).locator('[data-secretary-mode=manual]').is_visible()
        else:
            assert nykyinen_ajoneuvo(p).locator('[data-secretary-mode=text],[data-secretary-mode=speech],[data-secretary-mode=photo]').count() == 0
            assert nykyinen_ajoneuvo(p).locator('.secretary-actions [data-secretary-mode=manual]').is_visible()
            assert nykyinen_ajoneuvo(p).locator('.secretary-actions [data-secretary-service]').is_visible()
            if mode == 'quota':
                assert p.evaluate("AjouraAccess.check('ai.receipt').reason") == 'quota'
                p.locator('[data-home-mic]').click()
                assert 'Tämän kuun tunnistukset on käytetty.' in p.locator('.home-voice-feedback').inner_text()
        valitse_ajoneuvo(p, 'tst2')
        kirjaa_avustajasta(p, 'manual')
        ikkuna_valmis(p)
        assert p.get_attribute('#quickfuel-form', 'data-car') == 'tst2'
        assert p.locator('#quickfuel-form input[name=km]').is_visible()
        assert before == s.talli()
        assert cloud['ai'] == []
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tyhjan_tiedon_viesti_ei_keksi_havaintoa(browser, base):
    s = avaa(browser, base, 'home', autot=[tiedot.auto()], kello=KELLO,
             extra={})
    try:
        p = s.page
        avaa_ensimmainen_kortti(p)
        assert nykyinen_ajoneuvo(p).locator('[data-task-key]').count() == 0
        assert nykyinen_ajoneuvo(p).locator('.secretary-message').count() == 0
        assert nykyinen_ajoneuvo(p).locator('.assistant-local').count() == 0
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_lisavaihtoehtojen_nappaimisto_ja_tekstin_suurennus(browser, base):
    s = avaa(browser, base, 'home', autot=tiedot.talli(), kello=KELLO, leveys=320,
             extra={'ajoura-tekoaly':'1'})
    try:
        p = s.page
        avaa_ensimmainen_kortti(p)
        palvelu(s, oikeus=PLUS)
        avaa_ensimmainen_kortti(p)
        p.wait_for_function("AjouraAccess.check('ai.receipt').ok")
        summary = nykyinen_ajoneuvo(p).locator('.secretary-more>summary')
        summary.focus()
        p.keyboard.press('Enter')
        assert nykyinen_ajoneuvo(p).locator('[data-secretary-mode=manual]').is_visible()
        nykyinen_ajoneuvo(p).locator('[data-secretary-mode=text]').focus()
        p.keyboard.press('Escape')
        assert nykyinen_ajoneuvo(p).locator('.secretary-more').get_attribute('open') is None
        assert summary.evaluate('(e)=>e===document.activeElement')
        p.evaluate('''() => {
          const els=[...document.querySelectorAll('.secretary-card p,.secretary-card h3,.secretary-card summary,.secretary-actions button,.secretary-actions a')];
          const sizes=els.map(e=>parseFloat(getComputedStyle(e).fontSize));
          els.forEach((e,i)=>e.style.fontSize=sizes[i]*2+'px');
        }''')
        assert p.evaluate('document.querySelector("#app-screen").scrollWidth<=document.querySelector("#app-screen").clientWidth')
        avaa_kirjausvaihtoehdot(p)
        nykyinen_ajoneuvo(p).locator('[data-secretary-mode=manual]').click()
        ikkuna_valmis(p)
        assert p.locator('#quickfuel-form input[name=km]').is_visible()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_paikallinen_kokeilu_on_lisavaihtoehdoissa_ei_omana_korttina(browser, base):
    s = avaa(browser, base, 'home', autot=tiedot.talli(), kello=KELLO,
             extra={})
    try:
        p = s.page
        avaa_ensimmainen_kortti(p)
        p.add_init_script('window.__calls=0;window.AjouraAssistantFixtureTransport={fixture:true,ready:()=>true,request:()=>{window.__calls++;throw Error("unexpected request")}};')
        p.reload()
        p.wait_for_selector('.vehicle-home-card');avaa_ensimmainen_kortti(p)
        before = s.talli()
        assert p.locator('.secretary-home > .assistant-local').count() == 0
        assert nykyinen_ajoneuvo(p).locator('.secretary-task.assistant-local').count() == 0
        assert not nykyinen_ajoneuvo(p).locator('.assistant-local').is_visible()
        avaa_kirjausvaihtoehdot(p)
        assert nykyinen_ajoneuvo(p).locator('[data-assistant-opt]').is_visible()
        assert not nykyinen_ajoneuvo(p).locator('[data-assistant-opt]').is_checked()
        nykyinen_ajoneuvo(p).locator('[data-assistant-opt]').check()
        assert nykyinen_ajoneuvo(p).locator('.secretary-more').get_attribute('open') is not None
        assert nykyinen_ajoneuvo(p).locator('.assistant-local input[type=text]').is_visible()
        assert p.evaluate('window.__calls') == 0
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
