"""03C: public page navigation, truthful feature copy, languages and responsive layout."""
import pytest
from test_teemat import KONTRASTI
from test_kielet import KERUU

@pytest.mark.parametrize('width',[320,390,430,768,1024,1440])
@pytest.mark.parametrize('lang',['fi','en','sv'])
def test_landing(browser,base,width,lang):
    context=browser.new_context(viewport={'width':width,'height':900},color_scheme='dark')
    context.add_init_script("localStorage.setItem('ajoura-ulkoasu','nordic');localStorage.setItem('ajoura-hahmo','ankka');localStorage.setItem('ajoura-lang','%s');"%lang)
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    try:
        page.goto(base);page.wait_for_function('!!window.AjouraI18n')
        assert page.get_attribute('html','lang')==lang
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.locator('.secretary-greeting img').get_attribute('src')=='hahmot/emma.webp'
        assert page.locator('.secretary-greeting img').evaluate('(e)=>getComputedStyle(e).objectFit')=='contain'
        for image in page.locator('.landing-themes img').all():
            image.scroll_into_view_if_needed();image.evaluate('(e)=>e.decode()')
        assert page.evaluate("localStorage.getItem('ajoura-ulkoasu')")=='nordic'
        assert page.evaluate("localStorage.getItem('ajoura-hahmo')")=='ankka'
        page.evaluate('window.scrollTo(0,0)')
        if width<=900:
            assert not page.locator('#site-nav').is_visible()
            page.click('.site-menu-toggle');assert page.locator('#site-nav').is_visible()
        for target in ['idea','toiminta','lataa','ukk','yhteys']:
            assert page.locator(f'#site-nav a[href="#{target}"]').is_visible()
            assert page.locator('#'+target).count()==1
        for switch in ['en','sv','fi']:
            page.click(f'[data-set-lang={switch}]')
            assert page.get_attribute('html','lang')==switch
            assert page.locator(f'[data-set-lang={switch}]').get_attribute('aria-pressed')=='true'
            assert page.locator('meta[name=description]').get_attribute('content')
        assert 'autosihteerisi' in page.title()
        if width<=900:
            page.keyboard.press('Escape');assert not page.locator('#site-nav').is_visible()
            assert page.locator('.site-menu-toggle').evaluate('(e)=>e===document.activeElement')
            page.click('.site-menu-toggle');page.click('#site-nav a[href="#idea"]')
            assert page.url.endswith('#idea');assert not page.locator('#site-nav').is_visible()
        for a in page.locator('a[href^="app.html"]').all():assert a.get_attribute('href') in ['app.html','app.html?asenna=1']
        assert page.locator('a[href="mailto:info.ajoura@gmail.com"]').count()==1
        assert page.locator('a[href="tietosuoja.html"]').count()==2
        page.locator('.hero a[href="app.html"]').click();page.wait_for_url('**/app.html')
        assert not errors,errors
    finally:context.close()

@pytest.mark.parametrize('width',[320,1440])
def test_kontrasti_ja_tekstit(browser,base,width):
    p=browser.new_page(viewport={'width':width,'height':900})
    try:
        p.goto(base);p.wait_for_function('!!window.AjouraI18n')
        if width==320:p.click('.site-menu-toggle')
        p.locator('.site-faq details').evaluate_all('(es)=>es.forEach(e=>e.open=true)')
        script=KONTRASTI.replace("document.querySelector('#app-screen')","document.body").replace("svg, [aria-hidden=true]","script, style, svg, [aria-hidden=true]")
        bad=[v for v in p.evaluate(script) if v['k']<4.5]
        assert not bad,bad
        assert 'Web Speech' in p.inner_text('.ai-terms')
        future=p.inner_text('.roadmap-grid article:last-child')
        assert 'Yleisagentti' in future and 'Puhuvat hahmot' in future
    finally:p.close()

@pytest.mark.parametrize('lang',['en','sv'])
def test_kaikki_kielet(browser,base,lang):
    p=browser.new_page()
    try:
        p.goto(base);p.wait_for_function('!!window.AjouraI18n')
        script=KERUU.replace("['#app-screen', '.sheet-layer', '#install-dialog']","['body']")
        fi=set(p.evaluate(script));p.click(f'[data-set-lang={lang}]');other=set(p.evaluate(script))
        common=fi&other
        allowed={'AJOURA','Ajoura','Audi A6 Avant','Idea','by DRONEX','FI','SV','EN','iPhone','Android','Emma','info.ajoura@gmail.com','Some','TST-123 · 72 430 km','01','02','03','1','2','3','▶','↓','⋮','.'}
        assert not (common-allowed),common-allowed
        assert p.title()!= 'AJOURA — Henkilökohtainen autosihteerisi'
        assert 'Kirjaa tankkaukset' not in p.locator('meta[name=description]').get_attribute('content')
    finally:p.close()

@pytest.mark.parametrize('lang',['fi','en','sv'])
def test_video(browser,base,lang):
    p=browser.new_page(viewport={'width':1440,'height':900})
    try:
        p.goto(base);p.wait_for_function('!!window.AjouraI18n');p.click(f'[data-set-lang={lang}]')
        player=p.locator('[data-video]');player.focus();p.keyboard.press('Enter')
        video=player.locator('video');video.wait_for()
        suffix='' if lang=='fi' else '-'+lang
        assert video.get_attribute('src')==f'media/ajoura-esittely-vaaka{suffix}.mp4'
        p.wait_for_function('document.querySelector("video").readyState>=2')
        video.evaluate('(e)=>e.pause()')
        video.evaluate('(e)=>e.dispatchEvent(new Event("ended"))')
        assert player.get_attribute('role')=='button'
    finally:p.close()
