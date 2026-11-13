"""2.06: assistant shortcut; 2.15: in the middle of the bottom navigation, records only on a tap."""
import pytest
import tiedot
from apu import avaa, KELLO
from test_plus import PLUS, palvelu
from test_mikrofoni import KEKSITTY_PUHE


@pytest.mark.parametrize('width,height', [(320,568),(390,844),(430,932),(1440,1000)])
@pytest.mark.parametrize('nakyma', ['home', 'fuel/tst1', 'reports', 'menu'])
def test_avustaja_alavalikon_keskella_ja_muita_isompi(browser, base, width, height, nakyma):
    """2.15 (Niklas): the assistant is the larger button in the middle of the bottom navigation on every view;
    it no longer floats or moves, and the navigation stays in place while scrolling."""
    s=avaa(browser,base,nakyma,autot=tiedot.talli(),kello=KELLO,leveys=width,korkeus=height,
           asennettu=width<600,extra={})
    try:
        p=s.page;before=s.talli()
        nav=p.locator('.tab-dock>.main-tabs')
        lapset=nav.evaluate('n=>[...n.children].map(e=>e.matches(".nav-assistant")?"avustaja":e.getAttribute("aria-label"))')
        assert lapset==['Koti','Tankkaus ja lataus','avustaja','Huolto','Valikko'],lapset
        nappi=p.locator('.nav-assistant [data-home-mic]');b=nappi.bounding_box();n=nav.bounding_box()
        assert abs((b['x']+b['width']/2)-(n['x']+n['width']/2))<2,'avustaja keskellä'
        linkki=nav.locator('a').first.bounding_box()
        assert b['width']>linkki['height'] and b['height']>linkki['height'],'avustaja muita isompi'
        assert b['y']<n['y'],'avustaja nousee alavalikon yläpuolelle'
        assert b['x']>=0 and b['x']+b['width']<=width
        assert p.evaluate('e=>!document.querySelector(".tab-dock>.assistant-widget,.avatar-shortcut")', None)
        p.locator('#app-screen').evaluate('(e)=>e.scrollTop=e.scrollHeight');p.wait_for_timeout(100)
        assert abs(nappi.bounding_box()['y']-b['y'])<2
        assert p.evaluate('localStorage.getItem("ajoura-assistant-position")') is None
        assert s.talli()==before
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_rajaus_kosketus_ja_puhe_vasta_napautuksesta(browser,base):
    s=avaa(browser,base,'home',autot=tiedot.talli(),kello=KELLO,leveys=390,
           extra={'ajoura-tekoaly':'1'})
    try:
        p=s.page;cloud=palvelu(s,oikeus=PLUS)
        p.evaluate(KEKSITTY_PUHE);p.evaluate('AjouraApp.refresh()')
        widget=p.locator('.assistant-widget');button=widget.locator('button')
        # Real touchscreen sequence through Chromium, rather than synthetic pointer events.
        # A touch that starts on the button and moves away is not a tap: no recording starts.
        session=p.context.new_cdp_session(p);r=button.bounding_box()
        session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':r['x']+30,'y':r['y']+30}]})
        session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':40,'y':120}]})
        session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        assert p.evaluate('window.__puhe.started')==0
        assert p.locator('.sheet-layer').count()==0
        button.click()
        p.wait_for_function('window.__puhe.started===1')
        assert not cloud['ai']
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_widget_seuraa_ajoneuvoa_ja_tyhja_talli(browser,base):
    s=avaa(browser,base,'home',autot=tiedot.talli(),kello=KELLO,
           extra={})
    try:
        p=s.page
        assert p.locator('.assistant-widget [data-home-mic]').get_attribute('data-home-mic')=='tst1'
        p.locator('[data-vehicle-toggle]').nth(1).click()
        assert p.locator('.assistant-widget [data-home-mic]').get_attribute('data-home-mic')=='tst2'
        p.locator('.main-tabs a[aria-label="Huolto"]').click()
        p.wait_for_function('location.hash==="#vehicle/tst2"')
        assert p.locator('.assistant-widget [data-home-mic]').get_attribute('data-home-mic')=='tst2'
        p.locator('.assistant-widget button').click()
        assert p.locator('.home-voice-feedback').is_visible()
        assert p.locator('.sheet-layer').count()==0
        assert not s.virheet,s.virheet
    finally:s.sulje()
    s=avaa(browser,base,'home',autot=[],kello=KELLO)
    try:
        assert s.page.locator('.assistant-widget').count()==0
        assert s.page.locator('.main-tabs.four>a').count()==4
        assert not s.virheet,s.virheet
    finally:s.sulje()
