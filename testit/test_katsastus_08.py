"""08: estimates never masquerade as a verified inspection deadline."""
from pathlib import Path
import pytest,tiedot
from apu import avaa,KELLO,avaa_ajoneuvon_tiedot,avaa_tehtavan_lisatiedot


def car(date='2025-11-15'):
    return tiedot.auto(year=2010,events=[tiedot.merkinta('inspection','Katsastus',date,150000)])

@pytest.mark.parametrize('lang,estimate,unknown',[('fi','Katsastusarvio','Virallinen määräpäivä ei ole tiedossa.'),('en','Inspection estimate','The official deadline is not known.'),('sv','Besiktningsuppskattning','Den officiella sista dagen är inte känd.')])
@pytest.mark.parametrize('theme',['garage','nordic'])
def test_arvio_ei_maaraaika(browser,base,lang,estimate,unknown,theme):
    s=avaa(browser,base,'home',autot=[car()],kello=KELLO,kieli=lang,leveys=320,asennettu=True,extra={'ajoura-ulkoasu':theme})
    try:
        p=s.page;before=s.talli()
        avaa_ajoneuvon_tiedot(p)
        assert estimate in p.inner_text('.row-status')
        assert unknown in p.inner_text('.row-status')
        task=p.locator('[data-task-key*=inspection-check]');assert task.count()==1
        assert unknown in task.inner_text()
        for _ in range(4):p.evaluate('AjouraApp.refresh()')
        assert task.count()==1;avaa_tehtavan_lisatiedot(p,task);task.locator('[data-task-dismiss]').click();p.reload();p.wait_for_selector('.secretary-tasks');assert task.count()==0
        assert before==s.talli();assert not s.virheet,s.virheet
    finally:s.sulje()

@pytest.mark.parametrize('date',['2023-01-01','2026-09-01'])
def test_tarkistus_ei_vaita_myohastymista_tai_varausta(browser,base,date):
    s=avaa(browser,base,'home',autot=[car(date)],kello=KELLO)
    try:
        p=s.page
        avaa_ajoneuvon_tiedot(p)
        assert 'myöhässä' not in p.inner_text('.row-status')
        assert p.locator('.row-status.late,.row-status.soon,.upcoming li.late').count()==0
        assert p.locator('[data-task-key*=inspection-check]').count()==1
        p.locator('[data-task-key*=inspection-check] a').click();p.wait_for_selector('.upcoming')
        assert 'Virallinen määräpäivä ei ole tiedossa.' in p.inner_text('.upcoming')
        link=p.locator('.upcoming a[href^="https://www.traficom.fi/"]')
        assert link.count()==1 and 'TST-' not in link.get_attribute('href')
    finally:s.sulje()


def test_ei_historiaa_ei_keksittya_maaraaikaa(browser,base):
    s=avaa(browser,base,'home',autot=[tiedot.auto(year=2010)],kello=KELLO)
    try:assert s.page.locator('[data-task-key*=inspection-check]').count()==0
    finally:s.sulje()

@pytest.mark.parametrize('lang,title',[('fi','Katsastusarvio'),('en','Inspection estimate'),('sv','Besiktningsuppskattning')])
def test_vanha_kalenterivienti_on_myos_arvio(browser,base,lang,title):
    s=avaa(browser,base,'vehicle/tst1',autot=[car()],kello=KELLO,kieli=lang,mobiili=False)
    try:
        p=s.page;before=s.talli()
        with p.expect_download() as info:p.click('[data-ics]')
        text=Path(info.value.path()).read_text()
        assert 'SUMMARY:AJOURA: '+title in text
        assert '(myöhässä)' not in text
        assert before==s.talli()
    finally:s.sulje()

@pytest.mark.parametrize('theme',['garage','copilot','nordic','journey'])
def test_arvion_tekstin_kontrasti(browser,base,theme):
    from test_teemat import KONTRASTI
    s=avaa(browser,base,'home',autot=[car('2023-01-01')],kello=KELLO,leveys=320,asennettu=True,extra={'ajoura-ulkoasu':theme})
    try:
        avaa_ajoneuvon_tiedot(s.page)
        rows=[x for x in s.page.evaluate(KONTRASTI) if x['t'] in ['Katsastusarvio','Arvio','Virallinen määräpäivä ei ole tiedossa.','Tarkista katsastuksen määräpäivä']]
        assert len(rows)>=4
        assert not [x for x in rows if x['k']<4.5],rows
    finally:s.sulje()
