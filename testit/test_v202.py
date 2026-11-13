"""2.02: Finnish migration, compact mic shortcut and transparent image persistence."""
import pytest
from apu import nykyinen_ajoneuvo, avaa_ensimmainen_kortti
import tiedot
from apu import avaa,KELLO
from test_plus import PLUS,palvelu
from test_mikrofoni import KEKSITTY_PUHE

@pytest.mark.parametrize('saved',['fi','en','sv'])
def test_vanha_kielivalinta_siirtyy_suomeen(browser,base,saved):
    s=avaa(browser,base,'settings',autot=tiedot.talli(),extra={'ajoura-lang':saved})
    try:
        p=s.page
        avaa_ensimmainen_kortti(p)
        assert p.evaluate('AjouraI18n.lang')=='fi'
        assert p.evaluate('AjouraI18n.langs')==['fi']
        assert p.evaluate("localStorage.getItem('ajoura-lang')")=='fi'
        assert p.locator('[data-pref=Kieli],[data-set-lang]').count()==0
        p.evaluate("AjouraI18n.set('sv')")
        assert p.evaluate('AjouraI18n.lang')=='fi'
        assert p.locator('.app-heading').inner_text()=='Asetukset'
    finally:s.sulje()

@pytest.mark.parametrize('theme',['nykyinen'])
@pytest.mark.parametrize('width',[320,390,430])
def test_tiivis_palkki_ja_nakyva_mikrofoni(browser,base,theme,width):
    cars=tiedot.talli();cars[0]['photo']=tiedot.jpeg(koko=(600,400))
    s=avaa(browser,base,'home',autot=cars,leveys=width,kello=KELLO,extra={'ajoura-ulkoasu':theme})
    try:
        p=s.page
        avaa_ensimmainen_kortti(p)
        assert p.locator('.assistant-widget .assistant-avatar').bounding_box()['width']>=56
        assert p.locator('[data-home-mic]').is_visible()
        image=nykyinen_ajoneuvo(p).locator('.secretary-hero-media .car-photo img').bounding_box()
        plate=nykyinen_ajoneuvo(p).locator('.secretary-hero-meta').bounding_box()
        assert image['y']<=plate['y']<image['y']+image['height']
        # 2.14: no assistant name or greeting on the home screen.
        assert nykyinen_ajoneuvo(p).locator('.secretary-intro, .secretary-copy').count()==0
        p.locator('[data-home-mic]').click()
        assert 'Puhekirjaus tarvitsee' in p.locator('.home-voice-feedback').inner_text()
        assert not s.virheet
    finally:s.sulje()

def test_uusi_mikrofoni_kaynnistaa_nykyisen_puhepolun(browser,base):
    s=avaa(browser,base,'home',autot=tiedot.talli(),extra={'ajoura-tekoaly':'1'})
    try:
        p=s.page;avaa_ensimmainen_kortti(p);cloud=palvelu(s,oikeus=PLUS);avaa_ensimmainen_kortti(p);p.evaluate(KEKSITTY_PUHE);p.evaluate('AjouraApp.refresh()')
        p.locator('[data-home-mic]').click()
        p.wait_for_function('window.__puhe.started===1')
        p.wait_for_function("document.querySelector('#ai-say-in').value.includes('45,6')")
        assert not cloud['ai']
        assert not s.virheet
    finally:s.sulje()

@pytest.mark.parametrize('fail',[False,True])
def test_kuvan_kasittely_tallennus_ja_virhepolku(browser,base,fail):
    s=avaa(browser,base,'vehicle/tst1',autot=tiedot.talli(),extra={})
    try:
        p=s.page
        avaa_ensimmainen_kortti(p)
        import io,base64
        from PIL import Image
        image=Image.new('RGBA',(30,15),(255,255,255,0));image.paste((20,80,140,255),(3,3,27,12));buf=io.BytesIO();image.save(buf,format='PNG')
        output='data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()
        p.evaluate('''({fail,output})=>{window.__calls=0;AjouraCarPhoto.process=async d=>{window.__calls++;if(fail)throw new Error('offline');return output}}''',{'fail':fail,'output':output})
        import base64
        raw=base64.b64decode(tiedot.jpeg().split(',')[1])
        p.locator('[data-car-photos]').set_input_files({'name':'auto.jpg','mimeType':'image/jpeg','buffer':raw})
        p.wait_for_function('window.__calls===1&&!document.querySelector(".photo-processing")')
        assert s.talli()['cars'][0]['photo'].startswith('data:image/')
        if fail:assert 'Alkuperäinen kuva säilytettiin' in p.locator('.success-note').inner_text()
        else:
            original=s.talli()['cars'][0]['photo']
            assert original.startswith('data:image/jpeg;base64,')
            assert p.evaluate('source=>AjouraCarPhoto.display(source)',original)==output
            p.reload();p.wait_for_function('source=>AjouraCarPhoto.display(source).startsWith("data:image/png")',arg=original)
            p.goto(base+'/app.html#me');p.locator('[data-reset]').click()
            p.wait_for_function('AjouraApp.cars().length===0')
            p.reload();p.evaluate('AjouraCarPhoto.ready')
            assert p.evaluate('source=>AjouraCarPhoto.display(source)',original)==original
        if fail:p.evaluate('AjouraApp.refresh()');assert p.evaluate('window.__calls')==1
        assert not s.virheet
    finally:s.sulje()


def test_oikea_paikallinen_kuvamalli_ilman_ulkoisia_pyyntoja(browser,base):
    """Exercise the actual pinned ONNX model, rather than a mocked response."""
    import base64,io
    from PIL import Image
    p=browser.new_page();requests=[]
    p.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base) else r.abort())
    p.on('request',lambda r:requests.append((r.method,r.url)))
    try:
        p.goto(base+'/testit/fixtures/car-photo.html')
        result=p.evaluate('''async url=>{const blob=await(await fetch(url)).blob();const input=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob)});return await AjouraCarPhoto.process(input)}''',base+'/ui-art/landing-car.webp')
        assert result.startswith('data:image/png;base64,')
        image=Image.open(io.BytesIO(base64.b64decode(result.split(',')[1])))
        assert image.mode=='RGBA'
        low,high=image.getchannel('A').getextrema()
        assert low==0 and high>=250
        assert image.width>100 and image.height>50
        assert not [(method,url) for method,url in requests if not url.startswith((base,'data:')) or method!='GET']
    finally:p.close()
