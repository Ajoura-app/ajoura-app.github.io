"""2.06: draggable assistant remains with navigation and never records on drag."""
import pytest
import tiedot
from apu import avaa, KELLO
from test_plus import PLUS, palvelu
from test_mikrofoni import KEKSITTY_PUHE


def drag(page, box, x, y):
    page.mouse.move(box['x'] + box['width']/2, box['y'] + 25)
    page.mouse.down()
    page.mouse.move(x, y, steps=12)
    page.mouse.up()


@pytest.mark.parametrize('width,height', [(320,568),(390,844),(430,932),(1440,1000)])
def test_widget_pysyy_siirtyy_ja_muistaa(browser, base, width, height):
    s=avaa(browser,base,'home',autot=tiedot.talli(),kello=KELLO,leveys=width,korkeus=height,
           asennettu=width<600,extra={'ajoura-ulkoasu':'garage'})
    try:
        p=s.page;before=s.talli()
        widget=p.locator('.assistant-widget');button=widget.locator('button')
        assert widget.is_visible()
        first=widget.bounding_box();dock=p.locator('.tab-dock').bounding_box()
        assert first['y']+first['height']<=dock['y']
        p.locator('#app-screen').evaluate('(e)=>e.scrollTop=e.scrollHeight')
        p.wait_for_timeout(100)
        scrolled=widget.bounding_box()
        assert abs(first['x']-scrolled['x'])<2 and abs(first['y']-scrolled['y'])<2
        screen=p.locator('#app-screen').bounding_box()
        drag(p,scrolled,screen['x']+60,screen['y']+100)
        moved=widget.bounding_box()
        assert moved['y']<scrolled['y']-50
        assert p.locator('.sheet-layer').count()==0
        assert widget.locator('.home-voice-feedback').is_hidden()
        saved=p.evaluate('localStorage.getItem("ajoura-assistant-position")')
        assert saved
        p.reload();p.wait_for_selector('.assistant-widget');p.wait_for_timeout(100)
        restored=widget.bounding_box()
        assert abs(restored['x']-moved['x'])<2 and abs(restored['y']-moved['y'])<2
        p.locator('.main-tabs a[aria-label="Valikko"]').click()
        p.wait_for_function('location.hash==="#menu"')
        assert widget.is_visible()
        assert p.evaluate('localStorage.getItem("ajoura-assistant-position")')==saved
        button.focus();p.keyboard.press('ArrowRight')
        assert p.evaluate('localStorage.getItem("ajoura-assistant-position")')!=saved
        p.keyboard.press('Home')
        assert p.evaluate('localStorage.getItem("ajoura-assistant-position")') is None
        assert s.talli()==before
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_rajaus_kosketus_ja_puhe_vasta_napautuksesta(browser,base):
    s=avaa(browser,base,'home',autot=tiedot.talli(),kello=KELLO,leveys=390,
           extra={'ajoura-ulkoasu':'garage','ajoura-tekoaly':'1'})
    try:
        p=s.page;cloud=palvelu(s,oikeus=PLUS)
        p.evaluate(KEKSITTY_PUHE);p.evaluate('AjouraApp.refresh()')
        widget=p.locator('.assistant-widget');button=widget.locator('button')
        # Real touchscreen sequence through Chromium, rather than synthetic pointer events.
        session=p.context.new_cdp_session(p);r=button.bounding_box()
        session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':r['x']+32,'y':r['y']+25}]})
        session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':40,'y':120}]})
        session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        assert p.evaluate('window.__puhe.started')==0
        assert p.locator('.sheet-layer').count()==0
        p.set_viewport_size({'width':320,'height':568});p.wait_for_timeout(100)
        r=widget.bounding_box()
        assert 0<=r['x'] and r['x']+r['width']<=320
        assert 0<=r['y'] and r['y']+r['height']<=568
        button.click()
        p.wait_for_function('window.__puhe.started===1')
        assert not cloud['ai']
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_widget_seuraa_ajoneuvoa_ja_tyhja_talli(browser,base):
    s=avaa(browser,base,'home',autot=tiedot.talli(),kello=KELLO,
           extra={'ajoura-ulkoasu':'blue-track'})
    try:
        p=s.page
        assert p.locator('.assistant-widget [data-home-mic]').get_attribute('data-home-mic')=='tst1'
        p.locator('[data-secretary-next]').click()
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
        assert not s.virheet,s.virheet
    finally:s.sulje()
