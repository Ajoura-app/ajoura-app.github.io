"""Revised cinematic composition keeps original records and real form/task actions."""
import pytest
import tiedot
from apu import avaa, KELLO, valitse_ajoneuvo, kirjaa_avustajasta, ikkuna_valmis

@pytest.mark.parametrize('theme',['garage','copilot','nordic','journey'])
@pytest.mark.parametrize('width,height',[(320,568),(390,844),(430,932)])
@pytest.mark.parametrize('lang',['fi','en','sv'])
def test_cinematic_rakenne_ja_sailyvat_polut(browser,base,width,height,lang,theme):
    cars=tiedot.talli();cars[0]['photo']=tiedot.jpeg(koko=(600,400))
    s=avaa(browser,base,'home',autot=cars,kello=KELLO,kieli=lang,leveys=width,korkeus=height,
           asennettu=True,ios=True,extra={'ajoura-ulkoasu':theme,'ajoura-tekoaly':'0'})
    try:
        p=s.page;before=s.talli()
        assert p.locator('.secretary-cinematic').count()==1
        assert p.locator('.secretary-intro .assistant-avatar').bounding_box()['width']==64
        assert p.locator('.car-photo img').get_attribute('src')==cars[0]['photo']
        assert p.locator('.car-photo img').evaluate('(e)=>getComputedStyle(e).objectFit')=='contain'
        if not p.locator('.home-service>.secretary-vehicle-details').evaluate('(e)=>e.open'):
            p.locator('.home-service>.secretary-vehicle-details>summary').click()
        assert p.locator('.cinematic-task').count()==2
        assert p.locator('.cinematic-task').first.is_visible()
        p.locator('.cinematic-task>summary').first.click()
        p.locator('[data-task-later]').first.click()
        assert p.locator('.cinematic-task').count()==1
        p.locator('.cinematic-task>summary').first.click()
        p.locator('[data-task-dismiss]').first.click()
        assert p.locator('.task-empty').is_visible()
        p.locator('.secretary-all-tasks>summary').click()
        p.locator('[data-task-reset]').click()
        assert p.locator('.cinematic-task').count()==2
        p.locator('.cinematic-brand a[href="#newcar"]').click()
        p.wait_for_function('location.hash==="#newcar"')
        p.goto(base+'/app.html#home');p.wait_for_selector('.secretary-cinematic')
        valitse_ajoneuvo(p,'tst2');kirjaa_avustajasta(p,'manual');ikkuna_valmis(p)
        assert p.locator('#quickfuel-form').get_attribute('data-car')=='tst2'
        assert s.talli()==before
        assert p.evaluate('document.querySelector("#app-screen").scrollWidth<=document.querySelector("#app-screen").clientWidth')
        assert not s.virheet,s.virheet
    finally:s.sulje()


@pytest.mark.parametrize('theme',['garage','copilot','nordic','journey'])
@pytest.mark.parametrize('character',['emma','mikko','ankka'])
def test_hahmon_nimi_ja_puhepainike_kaksinkertaisella_tekstilla(browser,base,character,theme):
    from test_plus import PLUS,palvelu
    s=avaa(browser,base,'home',autot=tiedot.talli(),kello=KELLO,leveys=320,
           extra={'ajoura-ulkoasu':theme,'ajoura-hahmo':character,'ajoura-tekoaly':'1'})
    try:
        p=s.page;cloud=palvelu(s,oikeus=PLUS)
        p.wait_for_function("AjouraAccess.check('ai.receipt').ok")
        before=s.talli()
        p.evaluate('''()=>{const w=document.createTreeWalker(document.querySelector('.secretary-home'),NodeFilter.SHOW_TEXT),set=new Set();let n;while(n=w.nextNode()){const e=n.parentElement;if(n.textContent.trim()&&e.checkVisibility()&&!e.closest('svg,.sr-only,.row-name'))set.add(e)}const es=[...set],sizes=es.map(e=>parseFloat(getComputedStyle(e).fontSize));es.forEach((e,i)=>e.style.fontSize=sizes[i]*2+'px')}''')
        p.add_style_tag(content='.secretary-cinematic~.main-tabs a:after,html .main-tabs a:after{font-size:22px!important}')
        assert p.locator('.secretary-intro img').get_attribute('src')==f'hahmot/{character}.webp'
        assert p.evaluate('document.querySelector("#app-screen").scrollWidth<=document.querySelector("#app-screen").clientWidth')
        assert p.locator('.secretary-copy').evaluate('(e)=>e.scrollWidth<=e.clientWidth')
        assert before==s.talli()
        assert not cloud['ai']
        assert not s.virheet,s.virheet
    finally:s.sulje()
