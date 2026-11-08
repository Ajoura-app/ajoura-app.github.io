"""05: assistant reuses the existing forms and keeps drafts bound to their vehicle."""
import json
import pytest
import tiedot
from apu import avaa,KELLO,ikkuna_valmis, valitse_ajoneuvo
from test_plus import PLUS,FREE_AI,FREE_EI,palvelu,TEKOALY
from test_tekoalytila import TEKSTI


def cars():return [tiedot.auto(id='a',plate='TST-111'),tiedot.auto(id='b',plate='TST-222')]

@pytest.mark.parametrize('lang',['fi','en','sv'])
@pytest.mark.parametrize('rights',[PLUS,FREE_AI],ids=['plus','tester'])
def test_valittu_ajoneuvo_ja_vahvistus(browser,base,lang,rights):
    s=avaa(browser,base,'home',autot=cars(),kello=KELLO,kieli=lang,asennettu=True,ios=True,extra={'ajoura-tekoaly':'1'})
    try:
        p=s.page;cloud=palvelu(s,oikeus=rights);cloud['ai_vastaus']=TEKSTI
        p.wait_for_selector('[data-secretary-mode=text]');valitse_ajoneuvo(p,'b');before=s.talli()
        p.click('[data-secretary-mode=text]');p.fill('#ai-say-in','45,6 l dieseliä 84,77 € mittari 153100');p.click('[data-ai-send]')
        p.wait_for_selector('.task-ai-pending');assert p.get_attribute('#quickfuel-form','data-car')=='b'
        assert p.input_value('#quickfuel-form [name=qty]')=='45,60'
        assert before==s.talli();assert cloud['ai']==['ai.receipt']
        p.click('#quickfuel-form [type=submit]');p.wait_for_selector('.sheet-layer',state='detached')
        data=s.talli()['cars'];assert data[0]['fuels']==[] and len(data[1]['fuels'])==1
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_viivastynyt_vastaus_ei_siirry(browser,base):
    s=avaa(browser,base,'home',autot=cars(),kello=KELLO,extra={'ajoura-tekoaly':'1'})
    try:
        p=s.page;palvelu(s,oikeus=PLUS);p.wait_for_selector('[data-secretary-mode=text]');before=s.talli();requests=[]
        p.route(TEKOALY,lambda r:requests.append(r));p.click('[data-secretary-mode=text]');p.fill('#ai-say-in','45 l')
        with p.expect_request(TEKOALY):p.click('[data-ai-send]')
        p.keyboard.press('Escape');valitse_ajoneuvo(p,'b');p.click('[data-secretary-mode=manual]');ikkuna_valmis(p)
        requests.pop().fulfill(status=200,content_type='application/json',body=json.dumps(TEKSTI));p.wait_for_timeout(100)
        assert p.get_attribute('#quickfuel-form','data-car')=='b';assert p.input_value('#quickfuel-form [name=qty]')==''
        assert p.locator('.task-ai-pending').count()==0;assert before==s.talli()
        assert not s.virheet,s.virheet
    finally:s.sulje()

@pytest.mark.parametrize('lang',['fi','en','sv'])
@pytest.mark.parametrize('mode',['free','ai-off'])
def test_kasin_ja_opas(browser,base,lang,mode):
    s=avaa(browser,base,'home',autot=cars(),kello=KELLO,kieli=lang,asennettu=True,ios=True,leveys=320,extra={'ajoura-tekoaly':'0'})
    try:
        p=s.page;cloud=palvelu(s,oikeus=FREE_EI if mode=='free' else PLUS)
        valitse_ajoneuvo(p,'b');before=s.talli()
        assert p.locator('[data-secretary-mode=text]').count()==0
        p.click('.secretary-support [data-tutorial]');p.click('[data-guide-next]')
        assert p.locator('.ai-guide').is_visible();assert before==s.talli();p.keyboard.press('Escape')
        p.click('[data-secretary-service]');p.wait_for_selector('#event-form');assert p.url.endswith('#add/b')
        assert p.locator('[data-ai-send]').count()==0;assert before==s.talli();assert cloud['ai']==[]
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_offline_opastus_ja_huolto(browser):
    from conftest import JUURI
    from test_offline import Palvelin,Kayttaja
    server=Palvelin(JUURI);s=Kayttaja(browser,server,cars())
    try:
        s.asenna();before=s.talli();s.ctx.set_offline(True);s.avaa('home');p=s.page
        valitse_ajoneuvo(p,'b');p.click('.secretary-support [data-tutorial]');p.click('[data-guide-next]');p.keyboard.press('Escape')
        p.click('[data-secretary-service]');p.wait_for_selector('#event-form');assert p.url.endswith('#add/b')
        assert before==s.talli()
    finally:s.sulje();server.sulje()

@pytest.mark.parametrize('mode',['photo','manual'])
def test_suljetun_kuvan_kasittely_ei_laheta(browser,base,mode):
    import base64
    s=avaa(browser,base,'home',autot=cars(),kello=KELLO,extra={'ajoura-tekoaly':'1'})
    try:
        p=s.page;cloud=palvelu(s,oikeus=PLUS);p.wait_for_selector('[data-secretary-mode=text]');before=s.talli()
        p.click('[data-secretary-mode=text]' if mode=='photo' else '[data-secretary-mode=manual]')
        p.evaluate('''()=>{const Original=window.Image;window.Image=function(){const img=new Original();Object.defineProperty(img,'onload',{set(fn){img.addEventListener('load',()=>{window.__resumeImage=()=>fn.call(img)},{once:true});}});return img;};}''')
        selector='[data-ai-cam-file]' if mode=='photo' else '[data-ai-file]'
        p.locator(selector).set_input_files({'name':'receipt.jpg','mimeType':'image/jpeg','buffer':base64.b64decode(tiedot.jpeg().split(',')[1])})
        p.wait_for_function('!!window.__resumeImage');p.keyboard.press('Escape')
        valitse_ajoneuvo(p,'b');p.click('[data-secretary-mode=manual]')
        p.evaluate('window.__resumeImage()');p.wait_for_timeout(150)
        assert cloud['ai']==[];assert before==s.talli()
        assert p.get_attribute('#quickfuel-form','data-car')=='b'
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_huoltokortti_avaa_manuaalisen_lomakkeen(browser,base):
    from test_tehtavat import cars as due_cars
    s=avaa(browser,base,'home',autot=due_cars(),kello=KELLO)
    try:
        p=s.page;before=s.talli();p.locator('[data-task-key*="Huolto"] a').click()
        p.wait_for_selector('#event-form');assert p.url.endswith('#add/tst1');assert before==s.talli()
    finally:s.sulje()


def test_puhe_etusivulta_valitulle_autolle(browser,base):
    from test_mikrofoni import KEKSITTY_PUHE
    s=avaa(browser,base,'home',autot=cars(),kello=KELLO,asennettu=True,ios=True,extra={'ajoura-tekoaly':'1'})
    try:
        p=s.page;p.add_init_script(KEKSITTY_PUHE);cloud=palvelu(s,oikeus=PLUS);p.wait_for_selector('[data-secretary-mode=speech]')
        valitse_ajoneuvo(p,'b');before=s.talli();p.click('[data-secretary-mode=speech]')
        p.wait_for_function("document.querySelector('#ai-say-in').value.includes('153100')")
        assert cloud['ai']==[];assert before==s.talli();assert p.get_attribute('#quickfuel-form','data-car')=='b'
    finally:s.sulje()
