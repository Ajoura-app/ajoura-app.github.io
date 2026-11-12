"""Approved home: real car context, service, annual costs, shortcuts and voice."""
import pytest
from apu import nykyinen_ajoneuvo, avaa_ensimmainen_kortti
import tiedot
from apu import avaa,ikkuna_valmis,valitse_ajoneuvo
from test_mikrofoni import KEKSITTY_PUHE
from test_plus import PLUS,palvelu

CLOCK='2026-11-11T12:00:00'
THEMES=['garage','copilot','nordic','journey','nykyinen','dark']

def garage():
    cars=tiedot.talli()
    for c in cars:c['photo']=tiedot.jpeg(koko=(600,300))
    cars[0].update(events=[tiedot.merkinta('svc','Moottoriöljyn vaihto','2026-08-20',145600,cost='486'),tiedot.merkinta('old','Huolto','2025-08-20',130600,cost='900')],fuels=[tiedot.tankkaus('fill','2026-10-01',152400,50,1284.60)])
    return cars

@pytest.mark.parametrize('theme',THEMES)
@pytest.mark.parametrize('width',[320,390,430])
def test_approved_layout_and_values(browser,base,theme,width):
    s=avaa(browser,base,'home',autot=garage(),kello=CLOCK,leveys=width,asennettu=True,ios=True,teema='dark' if theme=='dark' else None,extra={'ajoura-ulkoasu':'nykyinen' if theme=='dark' else theme})
    try:
        p=s.page;avaa_ensimmainen_kortti(p);before=s.talli()
        order=nykyinen_ajoneuvo(p).evaluate('e=>[...e.children].map(x=>x.classList[0])')
        assert order==['secretary-vehicle','secretary-actions','home-expenses','vehicle-panels']
        assert nykyinen_ajoneuvo(p).locator('.home-service-original .row-pct').inner_text()=='55 % jäljellä'
        assert 'Ajettavaa jäljellä n. 8 200 km' in ' '.join(nykyinen_ajoneuvo(p).locator('.home-service-original').inner_text().split())
        costs=' '.join(nykyinen_ajoneuvo(p).locator('.home-expenses').inner_text().split())
        assert all(value in costs for value in ['1 284,60','486,00','1 770,60','2026'])
        assert '900,00' not in costs
        assert nykyinen_ajoneuvo(p).locator('.secretary-actions>*').count()==3
        assert p.locator('.secretary-mic .assistant-avatar').bounding_box()['width']==64
        pic=nykyinen_ajoneuvo(p).locator('.secretary-hero-media img').bounding_box();plate=nykyinen_ajoneuvo(p).locator('.secretary-hero-meta').bounding_box()
        assert pic['y']<=plate['y']<pic['y']+pic['height']
        assert nykyinen_ajoneuvo(p).locator('.secretary-vehicle-details').get_attribute('open') is None
        assert nykyinen_ajoneuvo(p).locator('.home-service-original .row-txt b').is_visible()
        assert p.evaluate('document.querySelector("#app-screen").scrollWidth<=document.querySelector("#app-screen").clientWidth')
        assert p.locator('.cinematic-brand a[aria-label="Profiili ja tili"]').get_attribute('href')=='#me/tili'
        assert s.talli()==before
        assert not s.virheet,s.virheet
    finally:s.sulje()

def test_vehicle_switch_shortcuts_and_navigation(browser,base):
    s=avaa(browser,base,'home',autot=garage(),kello=CLOCK,extra={'ajoura-ulkoasu':'garage'})
    try:
        p=s.page;avaa_ensimmainen_kortti(p);before=s.talli()
        p.locator('.cinematic-brand a[aria-label="Profiili ja tili"]').click();p.wait_for_function('location.hash==="#me/tili"')
        p.locator('.sync-box').wait_for()
        assert p.locator('.sync-box').is_visible()
        p.go_back();p.wait_for_selector('.secretary-refined')
        valitse_ajoneuvo(p,'tst2')
        assert 'TST-202' in nykyinen_ajoneuvo(p).locator('.secretary-hero-meta').inner_text()
        assert nykyinen_ajoneuvo(p).locator('.secretary-actions button').inner_text()=='Lataus'
        assert p.locator('.main-tabs a[aria-label="Huolto"]').get_attribute('href')=='#vehicle/tst2'
        assert p.locator('.main-tabs a[aria-label="Tankkaus ja lataus"]').get_attribute('href')=='#fuel/tst2'
        nykyinen_ajoneuvo(p).locator('[data-secretary-mode=manual]').click();ikkuna_valmis(p)
        assert p.locator('#quickfuel-form').get_attribute('data-car')=='tst2'
        p.keyboard.press('Escape')
        nykyinen_ajoneuvo(p).locator('[data-secretary-service]').click();p.wait_for_selector('#event-form')
        assert p.locator('#event-form').get_attribute('data-car')=='tst2'
        p.go_back();p.wait_for_selector('.secretary-refined');nykyinen_ajoneuvo(p).locator('[data-secretary-note]').click()
        assert p.url.endswith('#notes/tst2')
        p.go_back();p.wait_for_selector('.secretary-refined')
        p.evaluate('localStorage.setItem("ajoura-reports",JSON.stringify({car:"tst1",p:"month",offKinds:["fuel"],kp:{tot:{p:"all"}}}))')
        nykyinen_ajoneuvo(p).locator('[data-home-costs]').click();p.wait_for_function('location.hash==="#reports"')
        prefs=p.evaluate('JSON.parse(localStorage.getItem("ajoura-reports"))')
        assert prefs['car']=='tst2' and prefs['p']=='year' and prefs['offKinds']==[]
        p.goto(base+'/app.html#menu');p.locator('a[href="#reports"]').click()
        assert p.url.endswith('#reports')
        assert s.talli()==before
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_avatar_starts_speech_once(browser,base):
    s=avaa(browser,base,'home',autot=garage(),kello=CLOCK,extra={'ajoura-ulkoasu':'garage','ajoura-tekoaly':'1'})
    try:
        p=s.page;avaa_ensimmainen_kortti(p);cloud=palvelu(s,oikeus=PLUS);avaa_ensimmainen_kortti(p);p.evaluate(KEKSITTY_PUHE);p.evaluate('AjouraApp.refresh()')
        p.locator('[data-home-mic] img').click()
        p.wait_for_function('window.__puhe.started===1')
        p.wait_for_function('document.querySelector("#ai-say-in").value.includes("45,6")')
        assert not cloud['ai']
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_swipe_missing_service_and_overdue(browser,base):
    cars=garage();cars[0]['events']=[]
    s=avaa(browser,base,'home',autot=cars,kello=CLOCK,extra={'ajoura-ulkoasu':'nordic'})
    try:
        p=s.page
        avaa_ensimmainen_kortti(p)
        assert p.locator('[role=progressbar]').count()==0
        assert 'Kirjaa viimeisin huolto' in nykyinen_ajoneuvo(p).locator('.home-service').inner_text()
        target=nykyinen_ajoneuvo(p).locator('.secretary-vehicle');target.dispatch_event('touchstart',{'touches':[{'identifier':1,'clientX':270,'clientY':180}]});target.dispatch_event('touchend',{'changedTouches':[{'identifier':1,'clientX':60,'clientY':180}]})
        assert 'TST-101' in nykyinen_ajoneuvo(p).locator('.secretary-hero-meta').inner_text()
        assert p.url.endswith('#home')
        valitse_ajoneuvo(p,'tst2')
        p.evaluate('AjouraApp.cars()[1].km=200000;AjouraApp.refresh()')
        assert nykyinen_ajoneuvo(p).locator('.home-service-original .row-status.late').count()==1
        assert 'myöhässä' in nykyinen_ajoneuvo(p).locator('.home-service-original .row-txt b').inner_text()
        assert 'Kilometriraja ylitetty' in nykyinen_ajoneuvo(p).locator('.home-service-original').inner_text()
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_inspection_and_fuel_observations_remain_accessible(browser,base):
    cars=garage();cars[0]['events'].append(tiedot.merkinta('inspection','Katsastus','2024-01-01',130000,cost='55'))
    s=avaa(browser,base,'home',autot=cars,kello=CLOCK,extra={'ajoura-ulkoasu':'garage'})
    try:
        p=s.page;avaa_ensimmainen_kortti(p);before=s.talli()
        # Exercise an incomplete in-memory observation without weakening backup validation.
        p.evaluate('AjouraApp.cars()[0].fuels[0].km=null;AjouraApp.refresh()')
        assert nykyinen_ajoneuvo(p).locator('.home-service-original .row-txt b').inner_text()=='Huolto kunnossa'
        assert '20.8.2027' in nykyinen_ajoneuvo(p).locator('.home-service-original .row-txt strong').inner_text()
        assert 'tarkistettava' in nykyinen_ajoneuvo(p).locator('.home-inspection-alert').inner_text()
        assert 'mittarilukema' in nykyinen_ajoneuvo(p).locator('.home-cost-notice').inner_text()
        nykyinen_ajoneuvo(p).locator('.home-service>.secretary-vehicle-details>summary').click()
        assert nykyinen_ajoneuvo(p).locator('.secretary-primary').is_visible()
        assert s.talli()==before
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_voice_unavailable_feedback_stays_by_avatar(browser,base):
    s=avaa(browser,base,'home',autot=garage(),kello=CLOCK,asennettu=True,ios=True,extra={'ajoura-ulkoasu':'garage','ajoura-tekoaly':'0'})
    try:
        p=s.page;avaa_ensimmainen_kortti(p);before=s.talli()
        p.locator('[data-home-mic]').click()
        feedback=p.locator('.home-voice-feedback')
        assert feedback.is_visible() and 'Puhekirjaus tarvitsee' in feedback.inner_text()
        b=feedback.bounding_box();dock=p.locator('.tab-dock').bounding_box()
        assert b['y']+b['height']<=dock['y']+1
        assert s.talli()==before
        assert not s.virheet,s.virheet
    finally:s.sulje()
