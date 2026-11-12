"""2.09: approved floating capsule and grouped icon-only home shortcuts."""
import pytest
import tiedot
from apu import avaa, KELLO, ikkuna_valmis


@pytest.mark.parametrize('theme', ['nykyinen', 'dark', 'garage', 'copilot', 'nordic', 'journey'])
@pytest.mark.parametrize('width', [320, 390, 430])
def test_kelluva_palkki_ja_kuvakepainikkeet(browser, base, theme, width):
    s = avaa(browser, base, 'home', autot=tiedot.talli(), kello=KELLO,
             leveys=width, asennettu=True, ios=True,
             teema='dark' if theme == 'dark' else None,
             extra={'ajoura-ulkoasu': 'nykyinen' if theme == 'dark' else theme})
    try:
        p = s.page
        before = s.talli()
        dock = p.locator('.tab-dock')
        assert dock.evaluate('(e)=>getComputedStyle(e).backgroundImage') == 'none'
        assert dock.evaluate('(e)=>getComputedStyle(e).backgroundColor') == 'rgba(0, 0, 0, 0)'
        assert dock.locator('nav.main-tabs').count() == 1
        assert dock.locator('.main-tabs a').count() == 4
        for link in dock.locator('.main-tabs a').all():
            assert link.get_attribute('aria-label')
            assert link.evaluate('(e)=>getComputedStyle(e,"::after").content') == 'none'
            assert link.bounding_box()['height'] >= 44
        button = p.locator('.assistant-widget .secretary-mic')
        assert button.evaluate('(e)=>getComputedStyle(e).backgroundColor') == 'rgba(0, 0, 0, 0)'
        assert p.locator('.assistant-widget .home-mic-label').count() == 0
        assert button.get_attribute('aria-label') == 'Kirjaa puhumalla'
        for group in p.locator('.vehicle-home-card>.secretary-actions').all():
            assert group.evaluate('(e)=>parseFloat(getComputedStyle(e).paddingLeft)') >= 8
            assert group.evaluate('(e)=>{const s=getComputedStyle(e);return s.backgroundColor!=="rgba(0, 0, 0, 0)"||s.backgroundImage!=="none"}')
            assert group.locator(':scope>.home-add-icon').count() == 0
            assert group.locator(':scope>* .home-add-badge').count() == 3
            for action in group.locator(':scope>*').all():
                assert action.locator('.sr-only').count() == 1
                assert action.locator('.home-add-icon').is_visible()
                assert action.bounding_box()['width'] >= 44
                assert action.bounding_box()['height'] >= 44
        if theme == 'nykyinen':
            assert p.locator('.secretary-hero').first.evaluate('(e)=>getComputedStyle(e).backgroundColor') == 'rgb(233, 222, 206)'
        start = dock.bounding_box()
        p.locator('#app-screen').evaluate('(e)=>e.scrollTop=e.scrollHeight')
        assert abs(dock.bounding_box()['y'] - start['y']) < 2
        p.locator('.vehicle-home-card').nth(1).locator('[data-secretary-mode=manual]').click()
        ikkuna_valmis(p)
        assert p.locator('#quickfuel-form').get_attribute('data-car') == 'tst2'
        p.keyboard.press('Escape')
        assert p.evaluate('document.querySelector("#app-screen").scrollWidth<=document.querySelector("#app-screen").clientWidth')
        assert s.talli() == before
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
