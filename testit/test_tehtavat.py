"""04: task observations use real records; decisions never modify garage data."""
import pytest
import tiedot
from apu import avaa,KELLO, avaa_kirjausvaihtoehdot, kirjaa_avustajasta, avaa_tehtavat, avaa_tehtavan_lisatiedot


def test_tietokerros(browser,base):
    p=browser.new_page();p.goto(base+'/app.html?pwa=1');p.wait_for_function('!!window.AjouraTasks')
    try:
        assert p.evaluate('''()=>{
          const T=AjouraTasks,c={id:'x',fuels:[{id:'f',date:'2026-11-01',km:null}],events:[]};
          for(let i=0;i<10;i++)T.observe(c,[],'2026-11-08');
          if(T.snapshot().filter(x=>x.car==='x').length!==1)return false;
          T.decide('x:fuel:f','dismiss');if(T.observe(c,[],'2026-11-08').length)return false;
          T.reset('x');if(T.observe(c,[],'2026-11-08').length!==1)return false;
          c.fuels[0].km=0;T.observe(c,[],'2026-11-08');
          if(T.snapshot().find(x=>x.key==='x:fuel:f').state!=='done')return false;
          if(T.coverage(c).complete!==1)return false;
          c.fuels[0].km=null;T.observe(c,[],'2026-11-08');c.fuels=[];T.observe(c,[],'2026-11-08');
          return T.snapshot().find(x=>x.key==='x:fuel:f').state==='expired';
        }''')
    finally:p.close()


def cars():
    return [tiedot.auto(year=2010,events=[tiedot.merkinta('s','Huolto','2025-11-15',140000),tiedot.merkinta('i','Katsastus','2025-11-15',140000)],fuels=[tiedot.tankkaus('f','2026-11-01',152400,40,60)])]

@pytest.mark.parametrize('lang',['fi','en','sv'])
@pytest.mark.parametrize('theme',['garage','nordic'])
def test_tehtavat_ja_valinnat(browser,base,lang,theme):
    s=avaa(browser,base,'home',autot=cars(),kello=KELLO,kieli=lang,leveys=320,extra={'ajoura-ulkoasu':theme})
    try:
        p=s.page;before=s.talli();assert p.locator('.secretary-task').count()==2
        keys=p.locator('[data-task-key]').evaluate_all('(es)=>es.map(e=>e.dataset.taskKey)')
        p.evaluate('AjouraApp.refresh()');assert p.locator('[data-task-key]').evaluate_all('(es)=>es.map(e=>e.dataset.taskKey)')==keys
        avaa_tehtavan_lisatiedot(p,p.locator('.secretary-task').first)
        p.locator('[data-task-later]').first.click();assert p.locator('.secretary-task').count()==1
        avaa_tehtavan_lisatiedot(p,p.locator('.secretary-task').first)
        p.locator('[data-task-dismiss]').first.click();assert p.locator('.secretary-task').count()==0
        p.reload();p.wait_for_selector('.secretary-tasks');assert p.locator('.secretary-task').count()==0
        avaa_tehtavat(p);p.click('[data-task-reset]');assert p.locator('.secretary-task').count()==2
        assert before==s.talli()
        assert p.locator('.task-coverage').inner_text().startswith('1/1')
        assert p.evaluate("document.querySelector('#app-screen').scrollWidth<=document.querySelector('#app-screen').clientWidth")
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_rajat_ja_viimeisen_korjaus(browser,base):
    s=avaa(browser,base,'home',autot=cars(),kello=KELLO)
    try:
        p=s.page
        assert p.evaluate('''()=>{
          const T=AjouraTasks,c={id:'boundary',km:100,events:[],fuels:[]};
          const d={what:'Huolto',from:'2025-01-01',due:'2026-12-10',km:1000,intervalKm:1000};
          if(T.observe(c,[d],'2026-11-08').length)return false;
          c.km=850;if(T.observe(c,[d],'2026-11-08').length!==1)return false;
          T.decide(T.observe(c,[d],'2026-11-08')[0].key,'later');
          const real=Date.now;Date.now=()=>real()+864e5+1;
          if(T.observe(c,[d],'2026-11-08').length!==1)return false;Date.now=real;
          T.observe(c,[{...d,from:'2026-11-08',due:'2027-11-08',km:16000}],'2026-11-08');
          return T.snapshot().find(x=>x.car==='boundary'&&x.from==='2025-01-01').state==='done';
        }''')
    finally:s.sulje()


def test_nollatiedot_ai_pois(browser,base):
    s=avaa(browser,base,'home',autot=[tiedot.auto()],kello=KELLO)
    try:
        assert s.page.locator('.secretary-task').count()==0
        assert s.page.locator('.task-coverage').count()==0
        assert s.page.locator('[data-secretary-mode=text]').count()==0
        assert s.page.locator('[data-secretary-mode=manual]').is_visible()
    finally:s.sulje()


def test_tallennettu_korjaus(browser,base):
    s=avaa(browser,base,'home',autot=cars(),kello=KELLO)
    try:
        p=s.page;assert p.locator('.secretary-task').count()==2
        p.goto(base+'/app.html#edit/tst1/s');p.wait_for_selector('#event-form')
        p.fill('#event-form [name=date]','2026-10-20')
        p.fill('#event-form [name=km]','152400')
        p.click('#event-form [type=submit]');p.wait_for_selector('.screen-content')
        p.goto(base+'/app.html#home');p.wait_for_selector('.secretary-tasks')
        assert p.locator('.secretary-task').count()==1
        assert p.evaluate("AjouraTasks.snapshot().some(x=>x.kind==='Huolto'&&x.state==='done')")
        assert s.talli()['cars'][0]['events'][0]['date']=='2026-10-20'
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_tehtavat_offline(browser):
    from conftest import JUURI
    from test_offline import Palvelin,Kayttaja
    server=Palvelin(JUURI);s=Kayttaja(browser,server,cars())
    try:
        s.asenna();before=s.talli();s.ctx.set_offline(True);s.avaa('home')
        p=s.page;assert p.locator('.secretary-task').count()==2
        avaa_tehtavan_lisatiedot(p,p.locator('.secretary-task').first)
        p.locator('[data-task-dismiss]').first.click();assert p.locator('.secretary-task').count()==1
        s.avaa('home');assert p.locator('.secretary-task').count()==1
        assert s.talli()==before
    finally:s.sulje();server.sulje()


def test_enintaan_kolme(browser,base):
    p=browser.new_page();p.goto(base+'/app.html?pwa=1');p.wait_for_function('!!window.AjouraTasks')
    try:
        assert p.evaluate('''()=>{
          const T=AjouraTasks,c={id:'many',events:[],fuels:Array.from({length:8},(_,i)=>({id:'f'+i,date:'2026-10-20',km:null}))};
          return T.observe(c,[],'2026-11-08').length===3&&T.coverage(c).total===5;
        }''')
    finally:p.close()


def test_ai_peruutus(browser,base):
    from test_plus import PLUS,palvelu
    from test_tekoalytila import TEKSTI
    from apu import ikkuna_valmis
    s=avaa(browser,base,'home',autot=cars(),kello=KELLO,extra={'ajoura-tekoaly':'1'})
    try:
        cloud=palvelu(s,oikeus=PLUS);cloud['ai_vastaus']=TEKSTI
        p=s.page;avaa_kirjausvaihtoehdot(p);p.wait_for_selector('[data-secretary-mode=text]');before=s.talli()
        kirjaa_avustajasta(p,'text');p.fill('#ai-say-in','45,6 l dieseliä 84,77 € mittari 153100');p.click('[data-ai-send]')
        p.wait_for_selector('.task-ai-pending')
        assert p.evaluate("AjouraTasks.snapshot().find(x=>x.kind==='ai').state")=='awaiting_confirmation'
        p.keyboard.press('Escape')
        assert p.evaluate("AjouraTasks.snapshot().find(x=>x.kind==='ai').state")=='expired'
        assert before==s.talli()
    finally:s.sulje()
