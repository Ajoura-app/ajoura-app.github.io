"""Visual-first 02: original cinematic avatars, supported actions and confirmation boundaries."""
from copy import deepcopy

import pytest
import tiedot
from apu import avaa, KELLO, valitse_ajoneuvo, avaa_kirjausvaihtoehdot, kirjaa_avustajasta, ikkuna_valmis
from test_plus import PLUS, FREE_EI, palvelu


@pytest.mark.parametrize('character', ['emma', 'mikko', 'ankka'])
@pytest.mark.parametrize('ai', [False, True])
@pytest.mark.parametrize('width,height', [(390, 844), (320, 568)])
def test_kompakti_kortti_ja_alkuperaiset_hahmot(browser, base, character, ai, width, height):
    s = avaa(browser, base, 'home', autot=tiedot.talli(), kello=KELLO,
             leveys=width, korkeus=height, asennettu=True, ios=True,
             extra={'ajoura-ulkoasu':'garage', 'ajoura-hahmo':character, 'ajoura-tekoaly':'1' if ai else '0'})
    try:
        p = s.page
        cloud = palvelu(s, oikeus=PLUS) if ai else None
        if ai:
            p.wait_for_function("AjouraAccess.check('ai.receipt').ok")
        before = s.talli()
        assert p.locator('.secretary-card').count() == 1
        assert p.locator('.secretary-actions > button, .secretary-actions > a').count() == 3
        assert p.locator('.secretary-more').get_attribute('open') is None
        card = p.locator('.secretary-card').bounding_box()
        img = p.locator('.assistant-widget img')
        assert img.get_attribute('src') == f'hahmot/{character}.webp'
        assert img.evaluate('(e)=>e.complete&&e.naturalWidth===512&&getComputedStyle(e).objectFit==="contain"&&getComputedStyle(e).transform==="none"')
        frame = p.locator('.assistant-widget [data-avatar]').bounding_box()
        actual = img.bounding_box()
        assert frame['width'] == 64
        assert abs(actual['width'] - frame['width']) <= 1 and abs(actual['height'] - frame['height']) <= 1
        names = {'emma':'Emma', 'mikko':'Mikko', 'ankka':'Bottiankka'}
        assert p.inner_text('.secretary-intro [data-avatar-name]') == names[character]
        message=p.inner_text('.secretary-message')
        p.locator('.home-service>.secretary-vehicle-details>summary').click()
        assert message == p.locator('[data-task-key] h4').first.inner_text()
        p.locator('.home-service>.secretary-vehicle-details>summary').click()
        if ai:
            assert p.locator('.secretary-note').is_hidden()
            assert 'Tarkistat tiedot ennen tallennusta.' in p.inner_text('.secretary-note')
        if width == 390:
            assert 150 <= card['height'] <= 290, card
            dock = p.locator('.tab-dock').bounding_box()
            for action in p.locator('.secretary-actions > button, .secretary-actions > a').all():
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
             extra={'ajoura-ulkoasu':'garage','ajoura-tekoaly':'0' if mode == 'ai-off' else '1'})
    try:
        p = s.page
        if mode == 'text-only':
            p.add_init_script('delete window.SpeechRecognition;delete window.webkitSpeechRecognition;')
        elif mode == 'speech':
            from test_mikrofoni import KEKSITTY_PUHE
            p.add_init_script(KEKSITTY_PUHE)
        rights = deepcopy(FREE_EI if mode == 'free' else PLUS)
        if mode == 'quota':
            rights['quota']['ai'].update(limit=1, used=1)
        cloud = palvelu(s, oikeus=rights)
        before = s.talli()
        if mode in ['speech', 'text-only']:
            p.wait_for_function("AjouraAccess.check('ai.receipt').ok")
            primary = p.locator('.secretary-actions [data-secretary-mode]').evaluate_all('(els)=>els.map(e=>e.dataset.secretaryMode)')
            assert primary == ['manual']
            assert p.locator('[data-home-mic]').is_visible()
            assert p.locator('.secretary-more [data-secretary-mode=photo]').count()==1
            assert p.locator('[data-secretary-mode=manual]').is_visible()
        else:
            assert p.locator('[data-secretary-mode=text],[data-secretary-mode=speech],[data-secretary-mode=photo]').count() == 0
            assert p.locator('.secretary-actions [data-secretary-mode=manual]').is_visible()
            assert p.locator('.secretary-actions [data-secretary-service]').is_visible()
            if mode == 'quota':
                assert p.evaluate("AjouraAccess.check('ai.receipt').reason") == 'quota'
                assert 'Tämän kuun tunnistukset on käytetty.' in p.inner_text('.secretary-message')
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
             extra={'ajoura-ulkoasu':'garage'})
    try:
        p = s.page
        assert p.locator('[data-task-key]').count() == 0
        assert p.inner_text('.secretary-message') == 'Hei! Mitä kirjataan tänään?'
        assert p.locator('.assistant-local').count() == 0
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_lisavaihtoehtojen_nappaimisto_ja_tekstin_suurennus(browser, base):
    s = avaa(browser, base, 'home', autot=tiedot.talli(), kello=KELLO, leveys=320,
             extra={'ajoura-ulkoasu':'garage', 'ajoura-tekoaly':'1'})
    try:
        p = s.page
        palvelu(s, oikeus=PLUS)
        p.wait_for_function("AjouraAccess.check('ai.receipt').ok")
        summary = p.locator('.secretary-more>summary')
        summary.focus()
        p.keyboard.press('Enter')
        assert p.locator('[data-secretary-mode=manual]').is_visible()
        p.locator('[data-secretary-mode=text]').focus()
        p.keyboard.press('Escape')
        assert p.locator('.secretary-more').get_attribute('open') is None
        assert summary.evaluate('(e)=>e===document.activeElement')
        p.evaluate('''() => {
          const els=[...document.querySelectorAll('.secretary-card p,.secretary-card h3,.secretary-card summary,.secretary-actions button,.secretary-actions a')];
          const sizes=els.map(e=>parseFloat(getComputedStyle(e).fontSize));
          els.forEach((e,i)=>e.style.fontSize=sizes[i]*2+'px');
        }''')
        assert p.locator('.secretary-note').evaluate('(e)=>e.scrollHeight<=e.clientHeight')
        assert p.evaluate('document.querySelector("#app-screen").scrollWidth<=document.querySelector("#app-screen").clientWidth')
        avaa_kirjausvaihtoehdot(p)
        p.locator('[data-secretary-mode=manual]').click()
        ikkuna_valmis(p)
        assert p.locator('#quickfuel-form input[name=km]').is_visible()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_paikallinen_kokeilu_on_lisavaihtoehdoissa_ei_omana_korttina(browser, base):
    s = avaa(browser, base, 'home', autot=tiedot.talli(), kello=KELLO,
             extra={'ajoura-ulkoasu':'garage'})
    try:
        p = s.page
        p.add_init_script('window.__calls=0;window.AjouraAssistantFixtureTransport={fixture:true,ready:()=>true,request:()=>{window.__calls++;throw Error("unexpected request")}};')
        p.reload()
        p.wait_for_selector('.secretary-card')
        before = s.talli()
        assert p.locator('.secretary-home > .assistant-local').count() == 0
        assert p.locator('.secretary-task.assistant-local').count() == 0
        assert not p.locator('.assistant-local').is_visible()
        avaa_kirjausvaihtoehdot(p)
        assert p.locator('[data-assistant-opt]').is_visible()
        assert not p.locator('[data-assistant-opt]').is_checked()
        p.check('[data-assistant-opt]')
        assert p.locator('.secretary-more').get_attribute('open') is not None
        assert p.locator('.assistant-local input[type=text]').is_visible()
        assert p.evaluate('window.__calls') == 0
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
