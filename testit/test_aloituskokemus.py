"""03B: honest welcome, optional guide and preserved account/garage routes."""
import pytest
import tiedot
from apu import avaa,KELLO
from test_plus import palvelu,PLUS

@pytest.mark.parametrize('theme',['garage','copilot','nordic','journey'])
@pytest.mark.parametrize('character',['emma','mikko','ankka'])
@pytest.mark.parametrize('width',[320,390,430])
def test_welcome_matriisi(browser,base,theme,character,width):
    s=avaa(browser,base,'welcome',kello=KELLO,leveys=width,asennettu=True,ios=True,extra={'ajoura-ulkoasu':theme,'ajoura-hahmo':character})
    try:
        p=s.page
        assert p.get_attribute('.ai-welcome-hero img:not(.ai-welcome-logo)','src')==f'hahmot/{character}.webp'
        assert p.locator('.ai-welcome-hero .assistant-avatar img').evaluate('(e)=>getComputedStyle(e).objectFit')=='contain'
        assert p.evaluate("document.querySelector('#app-screen').scrollWidth<=document.querySelector('#app-screen').clientWidth")
        assert p.locator('[data-start]').is_visible()
        assert p.locator('a[href="#login"]').count()==1
        assert p.locator('.tutorial').count()==0
        assert not s.virheet,s.virheet
    finally:s.sulje()

@pytest.mark.parametrize('lang',['fi','en','sv'])
def test_opastus_vapaaehtoinen_ja_nappaimisto(browser,base,lang):
    s=avaa(browser,base,'welcome',kello=KELLO,kieli=lang,extra={'ajoura-hahmo':'mikko'})
    p=s.page
    try:
        p.evaluate("()=>{window.AudioContext=window.webkitAudioContext=window.Audio=class{constructor(){throw new Error('Unexpected audio');}};}")
        p.click('[data-tutorial]');p.wait_for_selector('.ai-guide')
        assert p.locator('#app-screen').evaluate('(e)=>e.inert')
        assert p.locator('.demo-header').evaluate('(e)=>e.inert')
        assert p.get_attribute('.ai-guide img','src')=='hahmot/mikko.webp'
        assert not s.virheet,s.virheet
        if lang=='en':assert p.inner_text('[data-guide-next]')=='Next'
        if lang=='sv':assert p.inner_text('[data-guide-next]')=='Nästa'
        first=p.inner_text('.ai-guide-main h2')
        p.wait_for_timeout(200)
        assert p.inner_text('.ai-guide-main h2')==first
        p.click('[data-guide-next]');assert p.inner_text('.ai-guide-main h2')!=first
        p.click('[data-guide-prev]');assert p.inner_text('.ai-guide-main h2')==first
        p.click('[data-guide-next]');p.click('[data-guide-next]');p.click('[data-guide-next]')
        assert p.locator('.tutorial').count()==0
        assert not p.locator('#app-screen').evaluate('(e)=>e.inert')
        assert p.locator('[data-tutorial]').evaluate('(e)=>e===document.activeElement')
        p.click('[data-tutorial]');p.keyboard.press('Escape')
        assert p.locator('.tutorial').count()==0
        if lang!='fi':assert 'Valitse avustajasi' not in p.inner_text('.ai-welcome')
    finally:s.sulje()


def test_vieras_hahmon_vaihto_ja_lisays(browser,base):
    s=avaa(browser,base,'welcome',kello=KELLO)
    try:
        p=s.page;p.click('.ai-welcome-personal summary');p.click('[data-avatar-choice=ankka]')
        assert p.get_attribute('.ai-welcome-hero .assistant-avatar img','src')=='hahmot/ankka.webp'
        assert not p.evaluate("AjouraAccess.can('ai.receipt')")
        p.click('[data-start]');p.wait_for_url('**#newcar')
        assert p.locator('.tutorial').count()==0,'Guest start must not force a guide'
        assert not s.virheet,s.virheet
    finally:s.sulje()

@pytest.mark.parametrize('logged',[False,True])
def test_palaava_ja_kirjautuminen(browser,base,logged):
    s=avaa(browser,base,'welcome',autot=tiedot.talli(),kello=KELLO)
    try:
        p=s.page
        if logged:palvelu(s,oikeus=PLUS)
        before=s.talli()
        assert p.locator('a[href="#home"]',has_text='Jatka omaan talliin').count()==1
        assert p.locator('a[href="#login"]').count()==(0 if logged else 1)
        p.click('.welcome-choices a[href="#home"]');p.wait_for_selector('.secretary-card')
        p.goto(base+'/app.html');p.wait_for_selector('.secretary-card')
        assert s.talli()==before
        assert p.locator('.ai-welcome').count()==0
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_video_sailyy(browser,base):
    s=avaa(browser,base,'welcome',kello=KELLO)
    try:
        s.page.click('.ai-welcome-video summary')
        assert s.page.locator('[data-video=phone]').is_visible()
    finally:s.sulje()


def test_welcome_ja_opastus_offline(browser):
    from test_offline import Palvelin,Kayttaja
    from conftest import JUURI
    server=Palvelin(JUURI);k=Kayttaja(browser,server,tiedot.talli())
    try:
        k.asenna();before=k.talli();k.ctx.set_offline(True);k.avaa('welcome')
        k.page.click('[data-tutorial]');k.page.wait_for_selector('.ai-guide')
        k.page.click('[data-guide-close]')
        k.page.click('.welcome-choices a[href="#home"]');k.page.wait_for_selector('.secretary-card')
        assert k.talli()==before
        assert not k.virheet,k.virheet
    finally:k.sulje();server.sulje()

@pytest.mark.parametrize('theme',['nykyinen','auto','eko','blue-track','premium','garage','copilot','nordic','journey'])
def test_kontrasti(browser,base,theme):
    from test_teemat import KONTRASTI
    s=avaa(browser,base,'welcome',kello=KELLO,extra={'ajoura-ulkoasu':theme})
    try:
        results=s.page.evaluate(KONTRASTI.replace("document.querySelector('#app-screen')","document.querySelector('.ai-welcome')"))
        errors=[(r['t'],r['k']) for r in results if r['k']<(3 if r['iso'] else 4.5)]
        assert not errors,errors
        s.page.click('[data-tutorial]')
        results=s.page.evaluate(KONTRASTI.replace("document.querySelector('#app-screen')","document.querySelector('.ai-guide')"))
        assert not [(r['t'],r['k']) for r in results if r['k']<(3 if r['iso'] else 4.5)]
    finally:s.sulje()


def test_opastuksen_jatkaminen(browser,base):
    s=avaa(browser,base,'welcome',kello=KELLO)
    try:
        p=s.page;p.click('[data-tutorial]');p.click('[data-guide-next]')
        heading=p.inner_text('.ai-guide-main h2');p.click('[data-guide-close]')
        p.reload();p.wait_for_selector('[data-tutorial]');p.click('[data-tutorial]')
        assert p.inner_text('.ai-guide-main h2')==heading
    finally:s.sulje()
