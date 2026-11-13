"""2.21 (Niklas): Raporttien kelluva ＋ lisää myös tankkauksen tai latauksen. Valittu ajoneuvo käytetään suoraan;
Kaikki ajoneuvot -tilassa ajoneuvo valitaan ensin. Lomake on sama tankkausikkuna kuin Kodissa."""
import json

import tiedot
from apu import KELLO, avaa


def test_kaikki_ajoneuvot_valinta_ensin(browser, base):
    s = avaa(browser, base, "reports", autot=tiedot.talli(), kello=KELLO, extra={"ajoura-reports": '{"p":"year"}'})
    try:
        p = s.page
        p.click('[data-fab-menu]')
        p.click('[data-fab-act=fuel]')
        p.wait_for_selector('.rp-addsheet')
        assert 'Lisää tankkaus tai lataus' in p.inner_text('.rp-addsheet')
        p.click('[data-rp-pickcar="tst2"]')
        p.wait_for_selector('#quickfuel-form')
        assert p.get_attribute('#quickfuel-form', 'data-car') == 'tst2'
        assert p.get_attribute('#quickfuel-form', 'data-unit') == 'kWh'  # sähköauto: lataus
        assert p.evaluate('location.hash') == '#reports'
        # Tallennus lisää latauksen ja se näkyy tapahtumalistan ensimmäisenä.
        f = '#quickfuel-form'
        p.fill(f + ' [name=km]', '48900'); p.fill(f + ' [name=qty]', '30'); p.fill(f + ' [name=cost]', '9')
        p.click(f + ' [type=submit]'); p.wait_for_selector('.sheet-layer', state='detached')
        p.wait_for_selector('.rx-list')
        uudet = [x for x in s.talli()["cars"][1]["fuels"] if x["km"] == 48900]
        assert len(uudet) == 1 and uudet[0]["qty"] == 30 and uudet[0]["cost"] == 9
        assert p.inner_text('.rx-list .rx-row >> nth=0').startswith('Lataus')
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_valittu_ajoneuvo_suoraan(browser, base):
    s = avaa(browser, base, "reports", autot=tiedot.talli(), kello=KELLO,
             extra={"ajoura-reports": json.dumps({"p": "year", "car": "tst1"})})
    try:
        p = s.page
        p.click('[data-fab-menu]')
        p.click('[data-fab-act=fuel]')
        p.wait_for_selector('#quickfuel-form')
        assert p.locator('.rp-addsheet').count() == 0
        assert p.get_attribute('#quickfuel-form', 'data-car') == 'tst1'
        assert p.get_attribute('#quickfuel-form', 'data-unit') == 'l'
        p.keyboard.press('Escape'); p.wait_for_selector('.sheet-layer', state='detached')
        assert p.evaluate('document.activeElement.matches("[data-fab-menu]")')
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_kodin_tankkauspikatoiminto_ennallaan(browser, base):
    s = avaa(browser, base, "home", autot=tiedot.talli(), kello=KELLO)
    try:
        p = s.page
        p.locator('.vehicle-home-card').nth(0).locator('[data-quickfuel]').first.click()
        p.wait_for_selector('#quickfuel-form')
        assert p.get_attribute('#quickfuel-form', 'data-car') == 'tst1'
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
