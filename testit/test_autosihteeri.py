"""Stage 01: vehicle context, existing write paths, themes and mobile widths."""
import pytest
import tiedot
from apu import avaa, KELLO, ikkuna_valmis, valitse_ajoneuvo, avaa_kirjausvaihtoehdot, kirjaa_avustajasta
from test_plus import palvelu, PLUS

@pytest.mark.parametrize('width',[320,375,390,430])
@pytest.mark.parametrize('theme',['nykyinen','dark','auto','eko','blue-track','premium'])
def test_asettelu(browser,base,width,theme):
    s=avaa(browser,base,'home',autot=tiedot.talli(),kello=KELLO,leveys=width,
           teema='dark' if theme=='dark' else None,
           extra={'ajoura-ulkoasu':theme if theme!='dark' else 'nykyinen'})
    try:
        assert s.page.locator('.secretary-card').is_visible()
        assert s.page.locator('.secretary-task').count() <= 3
        assert s.page.locator('.tab-fab').is_visible()
        assert s.page.evaluate("document.querySelector('#app-screen').scrollWidth<=document.querySelector('#app-screen').clientWidth")
        assert not s.virheet
    finally: s.sulje()

@pytest.mark.parametrize('lang',['fi','en','sv'])
def test_valinta_ja_kasin(browser,base,lang):
    cars=tiedot.talli()
    s=avaa(browser,base,'home',autot=cars,kello=KELLO,kieli=lang)
    try:
        before=s.talli()
        valitse_ajoneuvo(s.page,cars[1]['id'])
        assert cars[1]['plate'] in s.page.inner_text('.secretary-context')
        kirjaa_avustajasta(s.page,'manual')
        ikkuna_valmis(s.page)
        assert s.page.get_attribute('#quickfuel-form','data-car')==cars[1]['id']
        assert s.page.locator('#quickfuel-form input[name=km]').is_visible()
        assert before==s.talli()
        assert not s.virheet
    finally:s.sulje()

def test_ai_polut(browser,base):
    s=avaa(browser,base,'home',autot=tiedot.talli(),kello=KELLO,extra={'ajoura-tekoaly':'1'})
    try:
        palvelu(s,oikeus=PLUS)
        avaa_kirjausvaihtoehdot(s.page);s.page.wait_for_selector('[data-secretary-mode=text]')
        kirjaa_avustajasta(s.page,'text')
        assert s.page.locator('#ai-say-in').evaluate('(el)=>el===document.activeElement')
        s.page.keyboard.press('Escape')
        kirjaa_avustajasta(s.page,'manual')
        assert s.page.locator('#quickfuel-form input[name=km]').is_visible()
        assert not s.virheet
    finally:s.sulje()

def test_tyhja_ja_pyyhkaisy(browser,base):
    s=avaa(browser,base,'home',autot=[],kello=KELLO)
    try:
        assert s.page.locator('.secretary-card').count()==0
        assert s.page.locator('a[href="#newcar"]').count()>0
    finally:s.sulje()
    cars=tiedot.talli();s=avaa(browser,base,'home',autot=cars,kello=KELLO)
    try:
        s.page.locator('.secretary-vehicle').dispatch_event('touchstart',{'touches':[{'identifier':1,'clientX':260,'clientY':200}]})
        s.page.locator('.secretary-vehicle').dispatch_event('touchend',{'changedTouches':[{'identifier':1,'clientX':80,'clientY':200}]})
        assert cars[1]['plate'] in s.page.inner_text('.secretary-context')
    finally:s.sulje()

@pytest.mark.parametrize('width,height',[(844,390),(390,844)])
def test_turvallinen_sisalto_ja_suunta(browser,base,width,height):
    cars=[tiedot.auto(events=[])]
    cars[0]['nick']='<img src=x onerror=alert(1)>'
    s=avaa(browser,base,'home',autot=cars,kello=KELLO,leveys=width,korkeus=height,asennettu=True)
    try:
        assert s.page.locator('.secretary-context img').count()==0
        assert '<img' in s.page.inner_text('.secretary-context')
        assert s.page.locator('.secretary-task').count()==0
        assert s.page.evaluate("document.querySelector('#app-screen').scrollWidth<=document.querySelector('#app-screen').clientWidth")
        assert not s.virheet
    finally:s.sulje()
