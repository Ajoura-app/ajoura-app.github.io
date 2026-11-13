"""2.22 (Niklas): ajoneuvosivun ⋯-valikko: Muokkaa perustietoja, Muistiinpanot, Muistutukset, Huoltoväli ja
viimeisenä Poista ajoneuvo (sama vahvistus kuin ennen). Erilliset Muokkaa tietoja- ja Poista ajoneuvo -painikkeet
siirtyivät valikkoon."""
import pytest

import tiedot
from apu import KELLO, avaa

NIMET = ["Muokkaa perustietoja", "Muistiinpanot", "Muistutukset", "Öljynvaihtoväli", "Poista ajoneuvo"]  # 2.23: ajoneuvokohtainen


@pytest.mark.parametrize("leveys", [320, 390])
@pytest.mark.parametrize("teema", [None, "dark"])
def test_valikon_sisalto_ja_mitat(browser, base, leveys, teema):
    s = avaa(browser, base, "vehicle/tst1", autot=tiedot.talli(), kello=KELLO, leveys=leveys, teema=teema)
    try:
        p = s.page
        lista = p.locator('.veh-menu-list')
        assert lista.is_hidden()
        assert p.locator('.screen-content a[href="#caredit/tst1"]:visible, .screen-content > [data-remove]').count() == 0
        p.click('.veh-menu>summary')
        assert lista.is_visible()
        t = p.eval_on_selector_all('.veh-mi strong', 'e => e.map(x => x.innerText)')
        assert t == NIMET, t
        r = p.evaluate("""() => {const g = document.querySelector('#app-screen').getBoundingClientRect(),
          l = document.querySelector('.veh-menu-list').getBoundingClientRect();
          return {sisalla: l.left >= g.left && l.right <= g.right, korkeus: Math.min(...[...document.querySelectorAll('.veh-mi')].map(e => e.getBoundingClientRect().height)),
                  nappi: document.querySelector('.veh-menu>summary').getBoundingClientRect().height}}""")
        assert r["sisalla"] and r["korkeus"] >= 44 and r["nappi"] >= 44, r
        assert p.get_attribute('.veh-mi[href^="#caredit"]', 'href') == '#caredit/tst1'
        assert p.get_attribute('.veh-mi[href^="#notes"]', 'href') == '#notes/tst1'
        assert '15 000 km' in p.inner_text('.veh-mi[href="#oil/tst1"]').replace('\xa0', ' ')  # 2.23
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_sulkeutuu_ja_muistutukset(browser, base):
    s = avaa(browser, base, "vehicle/tst1", autot=tiedot.talli(), kello=KELLO)
    try:
        p = s.page
        p.click('.veh-menu>summary'); assert p.locator('.veh-menu-list').is_visible()
        p.click('.vehicle-hero h2', force=True); assert p.locator('.veh-menu-list').is_hidden()
        p.click('.veh-menu>summary'); p.keyboard.press('Escape')
        assert p.locator('.veh-menu-list').is_hidden() and p.evaluate("document.activeElement.matches('.veh-menu>summary')")
        p.click('.veh-menu>summary'); p.click('[data-veh-jump=upcoming]')
        assert p.locator('.veh-menu-list').is_hidden()
        p.wait_for_timeout(300)
        r = p.evaluate("""() => {const u = document.querySelector('.upcoming').getBoundingClientRect(), g = document.querySelector('#app-screen').getBoundingClientRect();
          return {nakyy: u.top >= g.top - 1 && u.top < g.bottom, fokus: !!document.activeElement.closest('.upcoming')}}""")
        assert r["nakyy"] and r["fokus"], r
        assert p.locator('.upcoming .cal-button').count() == 1  # kalenterivienti säilyy
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("hyvaksy", [False, True])
def test_poisto_kysyy_vahvistuksen(browser, base, hyvaksy):
    s = avaa(browser, base, "vehicle/tst2", autot=tiedot.talli(), kello=KELLO)
    try:
        p = s.page
        # Vahvistus: apu hyväksyy selaimen ikkunan; kieltäytyminen jäljitellään korvaamalla confirm.
        if not hyvaksy:
            p.evaluate("window.confirm = m => (window.__kysytty = m, false)")
        p.click('.veh-menu>summary'); p.click('.veh-mi[data-remove="tst2"]')
        if hyvaksy:
            p.wait_for_function('location.hash==="#home"')
            assert [c["id"] for c in s.talli()["cars"]] == ["tst1", "tst3"]
        else:
            assert "Kia Niro EV" in p.evaluate("window.__kysytty")
            assert [c["id"] for c in s.talli()["cars"]] == ["tst1", "tst2", "tst3"]
            assert p.evaluate("location.hash") == "#vehicle/tst2"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
