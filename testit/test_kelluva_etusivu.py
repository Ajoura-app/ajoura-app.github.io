"""2.09: approved floating capsule; 2.10: named shortcuts on the vehicle card."""
import pytest
import tiedot
from apu import avaa, KELLO, ikkuna_valmis


@pytest.mark.parametrize('theme', ['nykyinen', 'dark'])
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
        assert dock.locator('.main-tabs a').count() == 2  # 2.18: Koti ja Raportit (avustaja keskellä)
        for link in dock.locator('.main-tabs a').all():
            assert link.get_attribute('aria-label')
            assert link.evaluate('(e)=>getComputedStyle(e,"::after").content') == 'none'
            assert link.bounding_box()['height'] >= 44
        button = p.locator('.assistant-widget .secretary-mic')
        # 2.15: the assistant is a round button in the middle of the navigation.
        assert button.evaluate('(e)=>getComputedStyle(e).borderRadius') == '50%'
        assert p.locator('.assistant-widget .home-mic-label').count() == 0
        assert button.get_attribute('aria-label') == 'Kirjaa puhumalla'
        # 2.10: shortcuts are named icons in a plain row (see test_ajoneuvokortti.py for the full card).
        for group in p.locator('.vehicle-home-card>.secretary-actions').all():
            assert group.locator(':scope>*').count() == 3
            for action in group.locator(':scope>*').all():
                assert action.locator('.secretary-action-icon').is_visible()
                assert action.locator('.home-action-label').is_visible()
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
