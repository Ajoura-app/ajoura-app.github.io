"""2.05: original service status is visible once, even with details expanded."""
import pytest
from apu import avaa
from test_v203 import garage, CLOCK


@pytest.mark.parametrize('state', ['ok', 'late', 'missing'])
@pytest.mark.parametrize('theme', ['garage', 'blue-track', 'nordic'])
def test_alkuperainen_huoltonakyma_vain_kerran(browser, base, state, theme):
    cars = garage()
    if state == 'late':
        cars[0]['km'] = 200000
    elif state == 'missing':
        cars[0]['events'] = []
    s = avaa(browser, base, 'home', autot=cars, kello=CLOCK, leveys=320,
             extra={'ajoura-ulkoasu': theme})
    try:
        p = s.page
        before = s.talli()
        card = p.locator('.home-service')
        original = card.locator('.home-service-original .row-status')
        assert original.is_visible()
        assert card.locator('.home-service-heading,.home-service-progress').count() == 0
        if state == 'ok':
            assert '20.8.2027' in original.inner_text()
            assert original.locator('.row-pct').inner_text() == '55 % jäljellä'
        elif state == 'late':
            assert 'Huolto myöhässä' in original.inner_text()
        else:
            assert 'Huoltohistoria puuttuu' in original.inner_text()
            assert original.locator('.row-bar,.row-pct').count() == 0
        summary = card.locator('.secretary-vehicle-details>summary')
        summary.click()
        assert card.locator('.row-status').count() == 1
        assert original.is_visible()
        assert card.locator('.secretary-tasks').is_visible()
        assert card.locator('a', has_text='Avaa huoltohistoria').is_visible()
        summary.click()
        assert original.is_visible()
        card.locator('.home-service-original').click()
        p.wait_for_function('location.hash==="#vehicle/tst1"')
        assert before == s.talli()
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
