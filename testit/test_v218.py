"""2.18 (Niklas): alavalikko Koti | avustaja | Raportit. Tankkaus- ja Huolto-välilehdet poistuivat, Valikko on
Kodin ja Raporttien yläosan ⋯-painikkeen takana. Vanhat #fuel-linkit avaavat tankkauskirjan Raporttien alasivuna."""
import pytest

import tiedot
from apu import KELLO, avaa

LAPSET = 'n=>[...n.children].map(e=>e.matches(".nav-assistant")?"avustaja":e.getAttribute("aria-label"))'
VALITTU = '()=>document.querySelector(".main-tabs a[aria-current]")?.getAttribute("aria-label")||""'


@pytest.mark.parametrize("nakyma,valittu", [("home", "Koti"), ("vehicle/tst1", "Koti"), ("reports", "Raportit"),
                                            ("fuel/tst1", "Raportit"), ("menu", ""), ("settings", "")])
def test_alavalikko_ja_valittu_valilehti(browser, base, nakyma, valittu):
    s = avaa(browser, base, nakyma, autot=tiedot.talli(), kello=KELLO)
    try:
        p = s.page
        assert p.locator('.tab-dock>.main-tabs').evaluate(LAPSET) == ['Koti', 'avustaja', 'Raportit']
        assert p.locator('.main-tabs a[aria-label="Raportit"]').get_attribute('href') == '#reports'
        assert p.evaluate(VALITTU) == valittu
        # Kuvake: pohjaviiva, pumppu, letku, salama ja pylväät 24 × 24 -ruudussa.
        ik = p.locator('.main-tabs a[aria-label="Raportit"] svg')
        assert ik.get_attribute('viewBox') == '0 0 24 24' and ik.locator('path').count() == 5
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("nakyma", ["home", "reports"])
@pytest.mark.parametrize("leveys", [320, 390])
def test_valikko_ylaosan_kolmen_pisteen_takana(browser, base, nakyma, leveys):
    s = avaa(browser, base, nakyma, autot=tiedot.talli(), kello=KELLO, leveys=leveys)
    try:
        p = s.page
        b = p.locator('.screen-content a.top-menu')
        assert b.count() == 1 and b.get_attribute('aria-label') == 'Valikko'
        r = b.bounding_box()
        assert r['width'] >= 44 and r['height'] >= 44 and r['x'] + r['width'] <= leveys
        b.click()
        p.wait_for_function('location.hash==="#menu"')
        p.wait_for_selector('.menu-group')
        # Valikossa paluu Kotiin; Raportit ei enää toistu Valikossa.
        assert p.locator('.screen-content a.nav-back').get_attribute('href') == '#home'
        assert p.locator('.menu-group a[href="#reports"]').count() == 0
        assert p.locator('.menu-group a[href="#settings"]').count() == 1
        assert p.evaluate("document.querySelector('#app-screen').scrollWidth<=document.querySelector('#app-screen').clientWidth")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tyhja_talli_valikko_ja_raportit(browser, base):
    s = avaa(browser, base, "home", autot=[], kello=KELLO)
    try:
        p = s.page
        assert p.locator('.tab-dock>.main-tabs').evaluate(LAPSET) == ['Koti', 'Raportit']
        p.locator('.screen-content a.top-menu').click()
        p.wait_for_function('location.hash==="#menu"')
        p.locator('.main-tabs a[aria-label="Raportit"]').click()
        p.wait_for_selector('.rp-lead')
        assert p.inner_text('.rp-lead') == 'Tankkaukset, lataukset, huollot ja kulut'
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_raportit_alaotsikko_ja_tankkauskirjan_paluu(browser, base):
    s = avaa(browser, base, "reports", autot=tiedot.talli(), kello=KELLO)
    try:
        p = s.page
        assert p.inner_text('.rp-lead') == 'Tankkaukset, lataukset, huollot ja kulut'
        # Vanha Tankkaus-linkki toimii yhä ja palaa Raportteihin.
        p.evaluate('location.hash="#fuel/tst1"')
        p.wait_for_selector('.fv-head')
        back = p.locator('.screen-content a.nav-back')
        assert back.get_attribute('href') == '#reports'
        back.click()
        p.wait_for_function('location.hash==="#reports"')
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_pyyhkaisy_kodin_ja_raporttien_valilla(browser, base):
    s = avaa(browser, base, "home", autot=tiedot.talli(), kello=KELLO)
    try:
        p = s.page
        p.evaluate("""() => {const sc = document.querySelector('#app-screen'), t = (type, x) => {
          const touch = new Touch({identifier: 1, target: sc, clientX: x, clientY: 300});
          sc.dispatchEvent(new TouchEvent(type, {touches: type === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true}));};
          t('touchstart', 300); t('touchend', 100);}""")
        p.wait_for_function('location.hash==="#reports"')
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
