"""Visual-first 05: scene identity, readable large text and unchanged real entry paths."""
import pytest
import tiedot
from apu import avaa,KELLO

THEMES=['garage','copilot','nordic','journey']


@pytest.mark.parametrize('theme',THEMES)
def test_splashin_tekstikontrasti(browser,base,theme):
    from test_teemat import KONTRASTI
    s=avaa(browser,base,'welcome',kello=KELLO,extra={'ajoura-ulkoasu':theme})
    try:
        p=s.page
        p.evaluate('''()=>{const root=document.createElement('div');root.className='intro-overlay';root.innerHTML=AjouraLaunch.html('Testiversio');document.body.append(root)}''')
        rows=p.evaluate(KONTRASTI.replace("document.querySelector('#app-screen')","document.querySelector('.ai-intro')"))
        assert len(rows)>=5
        assert not [r for r in rows if r['k']<4.5],(theme,rows)
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_teemojen_ymparistot_ja_animaatiot_erottuvat(browser,base):
    art=[];light=[];content=[]
    for theme in THEMES:
        s=avaa(browser,base,'welcome',autot=tiedot.talli(),kello=KELLO,
               extra={'ajoura-ulkoasu':theme,'ajoura-hahmo':'mikko'})
        try:
            p=s.page;before=s.talli();p.emulate_media(reduced_motion='no-preference')
            p.evaluate('''()=>{const root=document.createElement('div');root.className='intro-overlay';root.innerHTML=AjouraLaunch.html('');document.body.append(root)}''')
            style=p.locator('.ai-intro-light').evaluate('''e=>({art:getComputedStyle(e,'::before').backgroundImage,light:getComputedStyle(e,'::after').animationName,interactive:getComputedStyle(e).pointerEvents})''')
            assert f'ui-art/{theme}-room.webp' in style['art']
            assert style['interactive']=='none'
            assert style['light']!='none'
            art.append(style['art']);light.append(style['light'])
            content.append(p.inner_text('.ai-intro'))
            assert p.locator('.ai-intro .assistant-avatar img').get_attribute('src')=='hahmot/mikko.webp'
            assert p.locator('.ai-intro .assistant-avatar').bounding_box()['width']>=190
            p.evaluate('document.querySelector(".intro-overlay").remove()')
            assert p.locator('.ai-welcome-capabilities li').count()==3
            assert p.locator('.ai-welcome-hero .assistant-avatar').bounding_box()['width']>=116
            assert before==s.talli()
            assert not s.virheet,s.virheet
        finally:s.sulje()
    assert len(set(art))==4 and len(set(light))==4
    assert len(set(content))==1,'Theme must not change capabilities or the selected character'


@pytest.mark.parametrize('theme',THEMES)
@pytest.mark.parametrize('lang',['fi','en','sv'])
@pytest.mark.parametrize('width,character',[(320,'ankka'),(430,'emma')])
def test_welcome_suuri_teksti_ja_alkuperaiset_ohjaimet(browser,base,theme,lang,width,character):
    s=avaa(browser,base,'welcome',kello=KELLO,kieli=lang,leveys=width,asennettu=True,ios=True,
           extra={'ajoura-ulkoasu':theme,'ajoura-hahmo':character})
    try:
        p=s.page;before=s.talli()
        assert p.locator('.ai-welcome-hero img').get_attribute('src')==f'hahmot/{character}.webp'
        assert p.locator('.ai-welcome-hero img').evaluate('(e)=>e.complete&&e.naturalWidth===512&&getComputedStyle(e).objectFit==="contain"')
        assert p.locator('.ai-welcome-personal').evaluate('(e)=>e.previousElementSibling.classList.contains("welcome-choices")')
        p.evaluate('''()=>{const root=document.querySelector('.ai-welcome'),w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),set=new Set();let n;while(n=w.nextNode()){const e=n.parentElement;if(n.textContent.trim()&&e.checkVisibility()&&!e.closest('svg,.sr-only'))set.add(e)}const es=[...set],sizes=es.map(e=>parseFloat(getComputedStyle(e).fontSize));es.forEach((e,i)=>e.style.fontSize=sizes[i]*2+'px')}''')
        assert p.evaluate('document.querySelector("#app-screen").scrollWidth<=document.querySelector("#app-screen").clientWidth')
        p.locator('.ai-welcome-personal>summary').focus();p.keyboard.press('Enter')
        p.locator('[data-avatar-choice=mikko]').click()
        assert p.locator('.ai-welcome-hero img').get_attribute('src')=='hahmot/mikko.webp'
        assert p.evaluate("localStorage.getItem('ajoura-ulkoasu')")==theme
        assert not p.evaluate("AjouraAccess.can('ai.receipt')")
        p.locator('.ai-welcome-personal a[href="#theme"]').click()
        p.wait_for_selector('[data-th-pick]')
        target=THEMES[(THEMES.index(theme)+1)%len(THEMES)]
        p.locator(f'[data-th-pick={target}]').click();p.locator('[data-th-apply]').click()
        assert p.evaluate("localStorage.getItem('ajoura-ulkoasu')")==target
        p.go_back();p.wait_for_selector('.ai-welcome')
        assert p.locator('.ai-welcome-hero img').get_attribute('src')=='hahmot/mikko.webp'
        p.locator('a[href="#login"]').click();p.wait_for_function('location.hash==="#login"')
        p.go_back();p.wait_for_selector('[data-start]');p.locator('[data-start]').click()
        p.wait_for_function('location.hash==="#newcar"')
        assert before==s.talli()
        assert not s.virheet,s.virheet
    finally:s.sulje()


@pytest.mark.parametrize('theme',THEMES)
def test_puuttuva_tausta_ja_liikkeeton_avaus(browser,base,theme):
    s=avaa(browser,base,'welcome',kello=KELLO,leveys=320,
           extra={'ajoura-ulkoasu':theme,'ajoura-hahmo-motion':'0'})
    try:
        p=s.page;p.route('**/ui-art/*',lambda r:r.abort());p.reload();p.wait_for_selector('.ai-welcome')
        before=s.talli();p.emulate_media(reduced_motion='no-preference')
        assert p.evaluate('AjouraLaunch.duration()')==200
        p.evaluate('''()=>{const root=document.createElement('div');root.className='intro-overlay';root.innerHTML=AjouraLaunch.html('');document.body.append(root)}''')
        assert p.locator('.ai-intro-content').evaluate('(e)=>getComputedStyle(e).animationName')=='none'
        assert p.locator('.ai-intro-light').evaluate('(e)=>getComputedStyle(e,"::after").animationName')=='none'
        assert p.locator('.ai-intro img').evaluate('(e)=>e.complete&&e.naturalWidth===512')
        p.evaluate('document.querySelector(".intro-overlay").remove()')
        p.locator('[data-start]').click();p.wait_for_function('location.hash==="#newcar"')
        assert before==s.talli()
        assert not s.virheet,s.virheet
    finally:s.sulje()


@pytest.mark.parametrize('lang',['fi','en','sv'])
def test_julkisen_heron_molemmat_ctat_ja_esimerkin_eristys(browser,base,lang):
    ctx=browser.new_context(viewport={'width':390,'height':844},service_workers='block')
    ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base) else r.abort())
    ctx.add_init_script("localStorage.setItem('ajoura-ulkoasu','nordic');localStorage.setItem('ajoura-hahmo','ankka');localStorage.setItem('ajoura-lang','"+lang+"');")
    try:
        p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.goto(base);p.wait_for_function('!!window.AjouraI18n')
        assert p.locator('.landing-scene img').evaluate('(e)=>e.complete&&e.naturalWidth>0')
        assert p.locator('.hero .actions>a').count()==2
        assert p.locator('.hero .actions').evaluate('(e)=>e.getBoundingClientRect().bottom<=innerHeight')
        p.locator('.hero a[href="#esittely"]').click();assert p.url.endswith('#esittely')
        assert p.locator('#esittely [data-video]').is_visible()
        p.goto(base);p.wait_for_function('!!window.AjouraI18n')
        assert p.evaluate("localStorage.getItem('ajoura-ulkoasu')")=='nordic'
        assert p.evaluate("localStorage.getItem('ajoura-hahmo')")=='ankka'
        assert p.evaluate("localStorage.getItem('ajoura-app-v2')")==None
        p.locator('.hero a[href="app.html"]').click();p.wait_for_url('**/app.html');p.wait_for_selector('.ai-welcome')
        assert p.locator('.ai-welcome-hero img').get_attribute('src')=='hahmot/ankka.webp'
        assert not errors,errors
    finally:ctx.close()
