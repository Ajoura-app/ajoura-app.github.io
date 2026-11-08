"""06: conservative observations from the existing validated fuel intervals."""
import pytest
import tiedot
from apu import avaa,KELLO, valitse_ajoneuvo


def car():
    return tiedot.auto(km=102000,events=[tiedot.merkinta('s','Huolto','2025-11-15',88000)],fuels=[tiedot.tankkaus('f'+str(i),d,100000+i*500,q,q*1.5) for i,(d,q) in enumerate(zip(['2026-09-01','2026-09-15','2026-10-01','2026-10-15','2026-10-25'],[50,50,50,50,70]))])

@pytest.mark.parametrize('lang',['fi','en','sv'])
@pytest.mark.parametrize('theme',['garage','nordic'])
def test_huomiot_ja_hiljennys(browser,base,lang,theme):
    c=car();other=tiedot.auto(id='other');s=avaa(browser,base,'home',autot=[c,other],kello=KELLO,kieli=lang,leveys=320,asennettu=True,ios=True,extra={'ajoura-ulkoasu':theme})
    try:
        p=s.page;before=s.talli();note=p.locator('[data-task-key*="consumption"]');assert note.count()==1
        assert '10.0 → 14.0 l/100 km' in note.inner_text()
        assert '2026-' in p.locator('[data-task-key*="Huolto"]').inner_text()
        p.evaluate('AjouraApp.refresh()');assert note.count()==1
        note.locator('[data-task-dismiss]').click();assert note.count()==0
        p.reload();p.wait_for_selector('.secretary-home');assert note.count()==0
        valitse_ajoneuvo(p,'other');assert p.locator('.secretary-task').count()==0
        valitse_ajoneuvo(p,'tst1');p.click('[data-task-reset]');assert note.count()==1
        assert before==s.talli();assert not s.virheet,s.virheet
    finally:s.sulje()

@pytest.mark.parametrize('case',['few','skip','wrong-order','implausible','small-rise','stale','partial'])
def test_laatu(browser,base,case):
    c=car()
    if case=='few':c['fuels']=c['fuels'][:3]
    elif case=='skip':c['fuels'][2]['skip']=True
    elif case=='wrong-order':c['fuels'][2]['km']=101900
    elif case=='implausible':c['fuels'][-1]['km']=101501
    elif case=='small-rise':c['fuels'][-1]['qty']=54
    elif case=='stale':
        for f in c['fuels']:f['date']=f['date'].replace('2026-','2025-')
    elif case=='partial':c['fuels'][2]['full']=False
    s=avaa(browser,base,'home',autot=[c],kello=KELLO)
    try:assert s.page.locator('[data-task-key*="consumption"]').count()==0
    finally:s.sulje()


def test_osatankkaus_kelvollisessa_valissa(browser,base):
    c=car();c['fuels'][2]['qty']=25;c['fuels'].insert(2,tiedot.tankkaus('part','2026-09-25',100750,25,37.5,taysi=False))
    s=avaa(browser,base,'home',autot=[c],kello=KELLO)
    try:assert '10.0 → 14.0' in s.page.locator('[data-task-key*="consumption"]').inner_text()
    finally:s.sulje()

@pytest.mark.parametrize('case',['few','short-span','contradiction','same-day','stale','future','boat','jump'])
def test_paivaennusteen_laatu(browser,base,case):
    c=car();c['events']=[]
    if case=='few':c['fuels']=c['fuels'][:3]
    elif case=='short-span':
        for i,f in enumerate(c['fuels']):f['date']='2026-10-'+str(20+i)
    elif case=='contradiction':c['fuels'][2]['km']=99999
    elif case=='same-day':c['fuels'][1]['date']=c['fuels'][0]['date']
    elif case=='stale':
        for f in c['fuels']:f['date']=f['date'].replace('2026-','2025-')
    elif case=='future':
        for f in c['fuels']:f['date']=f['date'].replace('2026-','2027-')
    elif case=='boat':c['kind']='boat';c['body']='open'
    elif case=='jump':c['fuels'][3]['date']='2026-10-24';c['fuels'][-1]['km']=102100
    s=avaa(browser,base,'home',autot=[c],kello=KELLO)
    try:
        result=s.page.evaluate('(c)=>AjouraInsights.analyze(c,[{what:"Huolto",from:"2025-11-15",km:103000}],[],"2026-10-28")',c)
        assert result['forecasts']=={}
    finally:s.sulje()

@pytest.mark.parametrize('unit,current,expected',[('l',12,1),('l',11.99,0),('kWh',12,0),('kWh',13,1),('kg',12,1)])
def test_kynnysarvot(browser,base,unit,current,expected):
    s=avaa(browser,base,'home',autot=[tiedot.auto()],kello=KELLO)
    try:
        count=s.page.evaluate('''([unit,current])=>{
          const series=[0,1,2,3].map(i=>({id:'f'+i,date:'2026-10-25',d:200,v:i===3?current:10}));
          const part={k:'fuel',u:unit,s:{series,sus:[],ord:[],fills:[{km:1},{km:2},{km:3},{km:4},{km:5}]}};
          return AjouraInsights.analyze({id:'x'},[],[part],'2026-10-28').tasks.length;
        }''',[unit,current])
        assert count==expected
    finally:s.sulje()


def test_havainnot_offline(browser):
    from conftest import JUURI
    from test_offline import Palvelin,Kayttaja
    server=Palvelin(JUURI);s=Kayttaja(browser,server,[car()])
    try:
        s.asenna();before=s.talli();s.ctx.set_offline(True);s.avaa('home')
        assert s.page.locator('[data-task-key*="consumption"]').count()==1
        s.page.locator('[data-task-key*="consumption"] [data-task-dismiss]').click()
        s.avaa('home');assert s.page.locator('[data-task-key*="consumption"]').count()==0
        assert before==s.talli()
    finally:s.sulje();server.sulje()
