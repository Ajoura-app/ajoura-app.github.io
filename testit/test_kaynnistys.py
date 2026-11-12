"""03A visual launch; existing routes, data and offline access stay intact."""
import pytest
import json
import tiedot
from apu import avaa,KELLO

@pytest.mark.parametrize('theme',['nykyinen'])
@pytest.mark.parametrize('character',['emma','mikko','ankka'])
def test_teema_hahmo_ja_paluu(browser,base,theme,character):
    from apu import Sivu
    ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block',reduced_motion='no-preference')
    ls={'ajoura-app-v2':tiedot.tila(tiedot.talli()),'ajoura-ulkoasu':theme,'ajoura-hahmo':character}
    ctx.add_init_script("if(!sessionStorage.getItem('test-init')){for(const [k,v] of Object.entries("+json.dumps(ls)+"))localStorage.setItem(k,v);sessionStorage.setItem('test-init','1');}")
    page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base) else r.abort())
    page.goto(base+'/app.html?pwa=1#home',wait_until='domcontentloaded')
    s=Sivu(ctx,page,errors)
    p=s.page
    try:
        before=s.talli();p.emulate_media(reduced_motion='no-preference')
        requests=[];p.on('request',lambda r:requests.append(r.url))
        p.wait_for_selector('.intro-overlay .ai-intro')
        assert p.get_attribute('.ai-intro .assistant-avatar img','src')==f'hahmot/{character}.webp'
        assert p.locator('.intro-road,.intro-receipts').count()==0
        assert p.evaluate('AjouraLaunch.duration()')==1400
        p.wait_for_selector('.intro-overlay',state='detached')
        assert s.talli()==before
        assert p.url.endswith('#home')
        assert all(u.startswith(base) for u in requests)
        p.reload();p.wait_for_selector('.vehicle-home-card')
        assert p.locator('.intro-overlay').count()==0
        assert not s.virheet,s.virheet
    finally:s.sulje()

@pytest.mark.parametrize('theme',['nykyinen'])
def test_fallback_ja_hiljainen_tila(browser,base,theme):
    s=avaa(browser,base,'welcome',kello=KELLO,leveys=320,extra={'ajoura-ulkoasu':theme,'ajoura-hahmo-motion':'0'})
    try:
        p=s.page;p.emulate_media(reduced_motion='no-preference')
        assert p.evaluate('AjouraLaunch.duration()')==200
        p.evaluate("document.body.insertAdjacentHTML('beforeend','<div class=\"intro-overlay\">'+AjouraLaunch.html('')+'</div>')")
        assert p.locator('.ai-intro-content').evaluate('(e)=>getComputedStyle(e).animationName')=='none'
        assert p.locator('.ai-intro').evaluate('(e)=>e.scrollWidth<=e.clientWidth')
    finally:s.sulje()

@pytest.mark.parametrize('lang',['fi','en','sv'])
@pytest.mark.parametrize('width,height',[(320,568),(390,844),(430,932),(844,390)])
def test_kieli_rajaukset_ja_vahennetty_liike(browser,base,lang,width,height):
    s=avaa(browser,base,'welcome',kello=KELLO,kieli=lang,leveys=width,korkeus=height,extra={'ajoura-hahmo':'ankka'})
    try:
        p=s.page
        assert p.evaluate('AjouraLaunch.duration()')==200
        p.evaluate("document.body.insertAdjacentHTML('beforeend','<div class=\"intro-overlay\">'+AjouraLaunch.html('')+'</div>')")
        assert p.locator('.ai-intro').evaluate('(e)=>e.scrollWidth<=e.clientWidth&&e.scrollHeight<=e.clientHeight')
        assert p.locator('.ai-intro img').last.evaluate('(e)=>getComputedStyle(e).objectFit')=='contain'
        if lang!='fi':assert 'Henkilökohtainen autosihteerisi' not in p.inner_text('.ai-intro')
    finally:s.sulje()


def test_ensikaytto_palaa_welcomeen(browser,base):
    ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,reduced_motion='reduce',service_workers='block')
    try:
        p=ctx.new_page();p.goto(base+'/app.html?pwa=1')
        p.wait_for_selector('.intro-overlay',state='detached')
        assert p.locator('[data-start]').is_visible()
        assert p.locator('a[href="#login"]').count()>0
    finally:ctx.close()


def test_kaynnistys_offline(browser):
    from test_offline import Palvelin,Kayttaja
    from conftest import JUURI
    server=Palvelin(JUURI);k=Kayttaja(browser,server,tiedot.talli())
    try:
        k.asenna();before=k.talli();k.page.emulate_media(reduced_motion='no-preference')
        k.ctx.add_init_script("sessionStorage.removeItem('ajoura-intro');localStorage.setItem('ajoura-hahmo','mikko');localStorage.setItem('ajoura-ulkoasu','copilot');")
        k.ctx.set_offline(True);k.avaa()
        k.page.wait_for_selector('.intro-overlay .ai-intro')
        assert k.page.get_attribute('.ai-intro .assistant-avatar img','src')=='hahmot/mikko.webp'
        k.page.wait_for_selector('.intro-overlay',state='detached')
        assert k.talli()==before
        assert not k.virheet,k.virheet
    finally:k.sulje();server.sulje()

@pytest.mark.parametrize('motion',['1','0'])
def test_demo_launcher(browser,base,motion):
    s=avaa(browser,base,'launcher',odota=False,mobiili=False,leveys=1200,korkeus=950,kello=KELLO,extra={'ajoura-hahmo-motion':motion,'ajoura-hahmo':'mikko'})
    try:
        p=s.page;p.wait_for_selector('[data-launch]');p.emulate_media(reduced_motion='no-preference');p.click('[data-launch]')
        p.wait_for_selector('.ai-intro')
        assert p.get_attribute('.ai-intro .assistant-avatar img','src')=='hahmot/mikko.webp'
        p.wait_for_selector('[data-start]')
        assert p.url.endswith('#welcome')
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_odottaa_kunnes_nakyvissa(browser,base):
    """Keep the existing slow-start guarantee for the new visual animation."""
    ctx=browser.new_context(viewport={'width':390,'height':760},is_mobile=True,reduced_motion='no-preference',service_workers='block')
    ctx.add_init_script("const original=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=function(){return new Promise(r=>setTimeout(r,800)).then(()=>original.call(this));};")
    try:
        p=ctx.new_page();p.goto(base+'/app.html?pwa=1',wait_until='commit')
        p.wait_for_selector('.ai-intro.intro-wait')
        states=p.locator('.ai-intro-content').evaluate('(e)=>e.getAnimations().map(a=>[a.playState,a.currentTime])')
        assert states and all(s[0]=='paused' and s[1]==0 for s in states)
        p.wait_for_selector('.ai-intro:not(.intro-wait)')
    finally:ctx.close()
