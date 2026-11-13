"""2.08: list navigation and task decisions preserve the correct vehicle context."""
import copy
import tiedot
from apu import avaa, KELLO
from test_tehtavat import cars


def test_jarjestys_on_saavutettavissa_listasta(browser, base):
    s=avaa(browser,base,'home',autot=tiedot.talli(),kello=KELLO)
    try:
        p=s.page;before=s.talli()
        p.locator('.home-order').click()
        p.wait_for_selector('.garage-rows')
        assert p.locator('.garage-rows .garage-row').count()==len(before['cars'])
        assert s.talli()==before
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_toisen_ajoneuvon_tehtavan_kohdistus_ja_avoin_lista(browser, base):
    first=cars()[0];second=copy.deepcopy(first);second.update(id='other',plate='TST-202')
    s=avaa(browser,base,'home',autot=[first,second],kello=KELLO,leveys=390,
           extra={})
    try:
        p=s.page;before=s.talli()
        cards=p.locator('.vehicle-home-card')
        for card in cards.all():
            card.locator('[data-vehicle-toggle]').click()
            card.locator('.secretary-vehicle-details>summary').click()
        other=cards.nth(1)
        other.locator('.secretary-all-tasks>summary').click()
        task=other.locator('.secretary-task').first
        task.locator('.task-details>summary').click()
        task.locator('[data-task-dismiss]').click()
        assert other.locator('.secretary-all-tasks').evaluate('(e)=>e.open')
        assert p.evaluate('document.activeElement.closest(".vehicle-home-card")?.dataset.car')=='other'
        assert cards.nth(0).locator('.secretary-task').count()==2
        assert other.locator('.secretary-task').count()==1
        assert cards.nth(0).locator('.secretary-vehicle-details').evaluate('(e)=>e.open')
        assert s.talli()==before
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_toisen_kortin_lisatiedot_paivittavat_botin_ja_alavalikon(browser,base):
    s=avaa(browser,base,'home',autot=tiedot.talli(),kello=KELLO)
    try:
        p=s.page
        first=p.locator('.vehicle-home-card').nth(0)
        second=p.locator('.vehicle-home-card').nth(1)
        second.locator('[data-vehicle-toggle]').click()
        first.locator('[data-vehicle-toggle]').click()
        assert p.locator('.assistant-widget [data-home-mic]').get_attribute('data-home-mic')=='tst1'
        second.evaluate('(e)=>window.__cardBefore=e')
        second.locator('.secretary-vehicle-details>summary').click()
        assert p.evaluate('window.__cardBefore.isConnected')
        assert second.locator('.secretary-vehicle-details').evaluate('(e)=>e.open')
        assert p.locator('.assistant-widget [data-home-mic]').get_attribute('data-home-mic')=='tst2'
        assert p.locator('.main-tabs a[aria-label="Huolto"]').get_attribute('href')=='#vehicle/tst2'
        assert p.locator('.main-tabs a[aria-label="Tankkaus ja lataus"]').get_attribute('href')=='#fuel/tst2'
        assert not s.virheet,s.virheet
    finally:s.sulje()
