"""Original avatars, independent device preferences and real operation states."""
import hashlib
from pathlib import Path
import pytest
import tiedot
from apu import avaa,KELLO,ikkuna_valmis
from conftest import JUURI
from test_plus import PLUS,palvelu
from test_mikrofoni import KEKSITTY_PUHE
from test_tekoalytila import TEKSTI

CHARACTERS=['emma','mikko','ankka']
THEMES=['nykyinen','dark','auto','eko','blue-track','premium','garage','copilot','nordic','journey']

@pytest.mark.parametrize('character',CHARACTERS)
def test_valinta_pysyvyys_ja_teema(browser,base,character):
    s=avaa(browser,base,'settings',autot=tiedot.talli(),kello=KELLO,extra={'ajoura-ulkoasu':'copilot'})
    p=s.page
    try:
        before=s.talli()
        p.fill('#me-form input[name=months]','9')
        p.click(f'[data-avatar-choice={character}]')
        assert p.input_value('#me-form input[name=months]')=='9','Hahmon vaihto tyhjensi keskeneräisen lomakkeen'
        p.goto(base+'/app.html#home');p.wait_for_selector('.secretary-card')
        assert p.get_attribute('.secretary-intro img','src')==f'hahmot/{character}.webp'
        assert p.evaluate("localStorage.getItem('ajoura-ulkoasu')")=='copilot'
        p.goto(base+'/app.html#theme');p.wait_for_selector('[data-th-pick=nordic]')
        p.click('[data-th-pick=nordic]');p.click('.th-opt.on [data-th-apply]')
        p.goto(base+'/app.html#home');p.wait_for_selector('.secretary-card');p.reload();p.wait_for_selector('.secretary-card')
        assert p.get_attribute('.secretary-intro img','src')==f'hahmot/{character}.webp'
        assert s.talli()==before
        assert not s.virheet,s.virheet
    finally:s.sulje()

@pytest.mark.parametrize('theme',THEMES)
def test_hahmot_ja_safe_area(browser,base,theme):
    s=avaa(browser,base,'home',autot=tiedot.talli(),kello=KELLO,leveys=320,asennettu=True,ios=True,
           teema='dark' if theme=='dark' else None,extra={'ajoura-ulkoasu':'nykyinen' if theme=='dark' else theme})
    p=s.page
    try:
        for character in CHARACTERS:
            p.goto(base+'/app.html#settings');p.wait_for_selector('[data-avatar-choice]')
            p.click(f'[data-avatar-choice={character}]')
            p.goto(base+'/app.html#home');p.wait_for_selector('.secretary-card')
            assert p.get_attribute('.secretary-intro img','src')==f'hahmot/{character}.webp'
            assert p.locator('.secretary-intro .assistant-avatar img').evaluate('(e)=>getComputedStyle(e).objectFit')=='contain'
            bounds=p.locator('.avatar-shortcut').bounding_box();plus=p.locator('.tab-fab').bounding_box();nav=p.locator('.main-tabs').bounding_box()
            assert bounds['x']+bounds['width']<=plus['x']
            assert bounds['y']+bounds['height']<=nav['y']
            assert p.evaluate("document.querySelector('#app-screen').scrollWidth<=document.querySelector('#app-screen').clientWidth")
        assert not s.virheet,s.virheet
    finally:s.sulje()

@pytest.mark.parametrize('width',[375,390,430])
def test_isommat_mobiilileveydet(browser,base,width):
    s=avaa(browser,base,'settings',autot=tiedot.talli(),kello=KELLO,leveys=width,extra={'ajoura-hahmo':'ankka'})
    try:
        assert s.page.locator('[data-avatar-choice=ankka]').get_attribute('aria-pressed')=='true'
        assert s.page.evaluate("document.querySelector('#app-screen').scrollWidth<=document.querySelector('#app-screen').clientWidth")
    finally:s.sulje()

@pytest.mark.parametrize('lang',['fi','en','sv'])
def test_kielet_ja_oikopolku(browser,base,lang):
    s=avaa(browser,base,'fuel/tst1',autot=tiedot.talli(),kello=KELLO,kieli=lang,extra={'ajoura-hahmo':'mikko'})
    try:
        s.page.click('[data-avatar-shortcut]')
        s.page.wait_for_selector('[data-avatar-choice=mikko]:focus')
        if lang!='fi':assert 'Hahmon animaatiot' not in s.page.inner_text('[data-avatar-settings]')
        assert 'Mikko' in s.page.get_attribute('[data-avatar-shortcut]','aria-label')
    finally:s.sulje()

@pytest.mark.parametrize('reduced,disabled',[('reduce',False),('no-preference',True),('no-preference',False)])
def test_animaation_hallinta(browser,base,reduced,disabled):
    s=avaa(browser,base,'settings',autot=tiedot.talli(),kello=KELLO)
    try:
        p=s.page;p.emulate_media(reduced_motion=reduced)
        if disabled:p.uncheck('[data-avatar-motion-toggle]')
        p.evaluate("AjouraAvatar.react('checking')")
        name=p.locator('[data-avatar-live]').first.evaluate('(e)=>getComputedStyle(e).animationName')
        assert (name=='none')==(reduced=='reduce' or disabled)
        if disabled:
            p.reload();p.wait_for_selector('[data-avatar-motion-toggle]')
            assert not p.is_checked('[data-avatar-motion-toggle]')
    finally:s.sulje()


def test_valinta_ei_anna_ai_oikeutta(browser,base):
    s=avaa(browser,base,'settings',autot=tiedot.talli(),kello=KELLO,extra={'ajoura-hahmo':'<img src=x>'})
    try:
        before=s.page.evaluate("[AjouraAccess.can('ai.receipt'),AjouraAccess.aiEnabled()]")
        assert s.page.locator('[data-avatar-choice=emma]').get_attribute('aria-pressed')=='true'
        for name in CHARACTERS:s.page.click(f'[data-avatar-choice={name}]')
        assert s.page.evaluate("[AjouraAccess.can('ai.receipt'),AjouraAccess.aiEnabled()]")==before
    finally:s.sulje()


def test_reaktiot_todellisesta_polusta(browser,base):
    s=avaa(browser,base,'fuel/tst1',autot=tiedot.talli(),kello=KELLO,extra={'ajoura-tekoaly':'1','ajoura-hahmo':'ankka'})
    try:
        p=s.page;p.add_init_script(KEKSITTY_PUHE)
        cloud=palvelu(s,oikeus=PLUS)
        before=s.talli()
        p.click('.fl-add');ikkuna_valmis(p)
        p.evaluate("window.__puhe.viive=1500")
        p.click('[data-ai-mic]')
        assert p.get_attribute('.avatar-sheet [data-avatar]','data-avatar-state')=='listening'
        p.wait_for_function("document.querySelector('.avatar-sheet [data-avatar]').dataset.avatarState==='neutral'")
        p.fill('#ai-say-in','45,6 l dieseliä 84,77 € mittari 153100')
        cloud['ai_vastaus']=TEKSTI
        from test_plus import TEKOALY
        requests=[]
        p.route(TEKOALY,lambda route:requests.append(route))
        with p.expect_request(TEKOALY):p.click('[data-ai-send]')
        p.wait_for_timeout(50)
        assert p.get_attribute('.avatar-sheet [data-avatar]','data-avatar-state')=='checking'
        requests.pop(0).fulfill(status=502,content_type='application/json',body='{}')
        p.wait_for_selector('.avatar-sheet [data-avatar-state=attention]')
        assert s.talli()==before
        with p.expect_request(TEKOALY):p.click('[data-ai-send]')
        p.wait_for_timeout(50)
        requests.pop(0).fulfill(status=200,content_type='application/json',body=__import__('json').dumps(TEKSTI))
        p.wait_for_selector('#quickfuel-form:not([hidden])')
        assert p.get_attribute('.avatar-sheet [data-avatar]','data-avatar-state')=='neutral','AI output is still only a draft'
        assert s.talli()==before
        assert p.evaluate("AjouraTasks.snapshot().find(x=>x.kind==='ai').state")== 'awaiting_confirmation'
        assert p.locator('.task-ai-pending').is_visible()
        p.click('#quickfuel-form [type=submit]')
        p.wait_for_selector('.avatar-shortcut [data-avatar-state=success]')
        assert len(s.talli()['cars'][0]['fuels'])==len(before['cars'][0]['fuels'])+1
        assert p.evaluate("AjouraTasks.snapshot().find(x=>x.kind==='ai').state")== 'done'
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_vain_hyvaksytyt_alkuperaiskuvat():
    expected={'emma.webp': '8b0a1435707541e9dfaa3d91254054a143983825482e4d98dbce1f4471cce4e5', 'mikko.webp': 'fb32168a582cc95841a0485c438716c674cb0ba8c658c184b414ca6699bf7ced', 'ankka.webp': '753ba97242b4040a7b62393949741b7d6e54238a2a6ee66139cc1ad386d9bb82', 'emma_128.webp': '7a10d4cf5c020a1a5936a2ba71c511507dc0e5a7ee49f3c8ffa3917aeb8a3faf', 'mikko_128.webp': 'ddde600a8e9dd9f58780b0a6d1c1c40053bed27e50adf9140932a4f5c7b7349b', 'ankka_128.webp': 'f14438b743263c80c5d648aa99f2298af0d4833669e03dd5cdde35796391ee8d'}
    for name,digest in expected.items():
        assert hashlib.sha256((JUURI/"hahmot"/name).read_bytes()).hexdigest()==digest


def test_hahmot_offline(browser):
    from test_offline import Palvelin,Kayttaja
    server=Palvelin(JUURI);k=Kayttaja(browser,server,tiedot.talli())
    try:
        k.asenna();before=k.talli();k.ctx.set_offline(True)
        for name in CHARACTERS:
            k.avaa('settings');k.page.click(f'[data-avatar-choice={name}]')
            k.avaa('home')
            assert k.page.get_attribute('.secretary-intro img','src')==f'hahmot/{name}.webp'
            assert k.page.locator('.secretary-intro img').evaluate('(e)=>e.complete&&e.naturalWidth===512')
            assert k.page.locator('.avatar-shortcut img').evaluate('(e)=>e.complete&&e.naturalWidth===128')
            assert k.talli()==before
        assert not k.virheet,k.virheet
    finally:k.sulje();server.sulje()
