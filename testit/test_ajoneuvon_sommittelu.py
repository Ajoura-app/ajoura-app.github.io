"""2.04: full vehicle and plate share a continuous, responsive room scene."""
import pytest
import tiedot
from apu import avaa, KELLO


@pytest.mark.parametrize('theme', ['nykyinen'])
@pytest.mark.parametrize('leveys', [320, 390, 430])
def test_yhtenainen_ajoneuvokuva(browser, base, theme, leveys):
    cars = tiedot.talli()
    cars[0]['photo'] = tiedot.jpeg(koko=(800, 420))
    s = avaa(browser, base, 'home', autot=cars, kello=KELLO, leveys=leveys,
             extra={'ajoura-ulkoasu': theme})
    try:
        p = s.page
        before = s.talli()
        hero = p.locator('.vehicle-home-card').first.locator('.secretary-hero')
        media = p.locator('.vehicle-home-card').first.locator('.secretary-hero-media')
        plate = p.locator('.vehicle-home-card').first.locator('.secretary-hero-meta')
        h, m, a = hero.bounding_box(), media.bounding_box(), plate.bounding_box()
        # 2.11: one theme; the vehicle stands in the beige studio scene.
        assert 'radial-gradient' in hero.evaluate('(e)=>getComputedStyle(e).backgroundImage')
        assert abs(h['height'] - m['height']) < 4, 'Plate must not create a separate row'
        assert a['y'] >= m['y'] and a['y'] + a['height'] <= m['y'] + m['height'] + 1
        image = p.locator('.vehicle-home-card').first.locator('.secretary-hero-media img')
        assert image.evaluate('(e)=>getComputedStyle(e).objectFit') == 'contain'
        # 2.10: the card frame of the approved mock-up leaves the photo almost the full scene width; on a 320 px
        # phone the photo is then about 135 px high, so either size proves the vehicle is shown as large as possible.
        kuva = image.bounding_box()
        assert kuva['height'] >= 140 or kuva['width'] >= m['width'] - 12, (kuva, m)
        assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
        plate.click()
        p.wait_for_function('location.hash==="#vehicle/tst1"')
        assert s.talli() == before
        assert not s.virheet
    finally:
        s.sulje()
