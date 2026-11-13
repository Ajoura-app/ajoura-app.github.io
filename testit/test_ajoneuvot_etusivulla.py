"""2.07: each vehicle has independent image toggle and always visible actions."""
import pytest
import tiedot
from apu import avaa,KELLO,ikkuna_valmis

@pytest.mark.parametrize('width',[320,390,430])
@pytest.mark.parametrize('theme',['nykyinen'])
def test_kaikki_ajoneuvot_ja_omat_paneelit(browser,base,width,theme):
    s=avaa(browser,base,'home',autot=tiedot.talli(),kello=KELLO,leveys=width,extra={'ajoura-ulkoasu':theme})
    try:
        p=s.page;before=s.talli();cards=p.locator('.vehicle-home-card')
        assert cards.count()==3
        assert p.locator('[data-secretary-next],.secretary-picker').count()==0
        for card in cards.all():
            assert card.locator('.vehicle-glance').is_visible()
            assert card.locator('.vehicle-panels').is_hidden()
            assert card.locator('>.secretary-actions>*').count()==3
            assert all(x.is_visible() for x in card.locator('>.secretary-actions>*').all())
        first=cards.nth(0);second=cards.nth(1)
        first.locator('[data-vehicle-toggle]').click()
        assert first.locator('.home-service').is_visible()
        assert first.locator('.home-expenses').is_visible()
        assert second.locator('.vehicle-panels').is_hidden()
        second.locator('[data-vehicle-toggle]').click()
        assert first.locator('.home-service').is_visible()
        assert second.locator('.home-service').is_visible()
        first.locator('[data-vehicle-toggle]').click()
        assert first.locator('.vehicle-panels').is_hidden()
        assert first.locator('.vehicle-glance').is_visible()
        second.locator('>.secretary-actions button').click();ikkuna_valmis(p)
        assert p.locator('#quickfuel-form').get_attribute('data-car')=='tst2'
        p.keyboard.press('Escape')
        second.locator('[data-secretary-service]').click()
        p.wait_for_selector('#event-form')
        assert p.locator('#event-form').get_attribute('data-car')=='tst2'
        assert s.talli()==before
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_nappaimisto_muistiinpano_ja_ei_sivuttaisvaihtoa(browser,base):
    s=avaa(browser,base,'home',autot=tiedot.talli(),kello=KELLO,leveys=390)
    try:
        p=s.page;first=p.locator('.vehicle-home-card').first
        button=first.locator('[data-vehicle-toggle]');button.focus();p.keyboard.press('Enter')
        assert button.get_attribute('aria-expanded')=='true'
        p.keyboard.press('Space')
        assert button.get_attribute('aria-expanded')=='false'
        hero=first.locator('.secretary-vehicle')
        hero.dispatch_event('touchstart',{'touches':[{'identifier':1,'clientX':270,'clientY':180}]})
        hero.dispatch_event('touchend',{'changedTouches':[{'identifier':1,'clientX':60,'clientY':180}]})
        assert button.get_attribute('aria-expanded')=='false'
        assert p.locator('.vehicle-home-card').count()==3
        second=p.locator('.vehicle-home-card').nth(1)
        second.locator('[data-vehicle-toggle]').click()
        assert p.locator('.assistant-widget [data-home-mic]').get_attribute('data-home-mic')=='tst2'
        second.locator('[data-secretary-note]').click()
        p.wait_for_function('location.hash==="#notes/tst2"')
        assert not s.virheet,s.virheet
    finally:s.sulje()
