"""07 local prototype uses the actual Node core with fictional providers, never Supabase/AI."""
import json,subprocess,urllib.request,urllib.error
from pathlib import Path
import pytest,tiedot
from apu import avaa,KELLO
from conftest import JUURI

@pytest.fixture
def local_api(tmp_path):
    state={'cars':tiedot.talli(),'profile':{'months':12,'km':15000}}
    path=tmp_path/'fictional.json';path.write_text(json.dumps(state))
    proc=subprocess.Popen(['node','paikallinen/fixture-server.mjs','--fixture-only',str(path)],cwd=JUURI,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    port=json.loads(proc.stdout.readline())['port'];url=f'http://127.0.0.1:{port}'
    def request(body):
        req=urllib.request.Request(url+'/assistant',data=json.dumps(body).encode(),headers={'Authorization':'Bearer fixture-user','Content-Type':'application/json'})
        try:r=urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:r=e
        with r:return {'status':r.status,'body':json.load(r)}
    yield request,url
    proc.terminate();proc.wait(timeout=5)


def bind(s,api):
    s.page.expose_binding('assistantRequest',lambda source,body:api(body))
    s.page.add_init_script("window.__assistantReady=true;window.AjouraAssistantFixtureTransport={fixture:true,request:b=>window.assistantRequest(b),ready:()=>window.__assistantReady};")
    s.page.reload();s.page.wait_for_selector('.assistant-local')

@pytest.mark.parametrize('lang',['fi','en','sv'])
def test_local_browser(browser,base,local_api,lang):
    request,url=local_api
    s=avaa(browser,base,'home',autot=tiedot.talli(),kello=KELLO,kieli=lang,asennettu=True,ios=True,leveys=320,extra={'ajoura-ulkoasu':'nordic'})
    try:
        bind(s,request);p=s.page;before=s.talli()
        assert p.locator('[data-assistant-send]').count()==0;p.check('[data-assistant-opt]')
        p.fill('.assistant-local input[type=text]','kulutus');p.click('[data-assistant-send]')
        p.wait_for_function("document.querySelector('.assistant-local-result').textContent.includes('l/100 km')")
        assert not p.locator('.assistant-local-result script').count()
        assert before==s.talli();p.click('[data-secretary-car=tst2]')
        assert p.locator('.assistant-local-result').inner_text()==''
        p.evaluate('window.__assistantReady=false');p.fill('.assistant-local input[type=text]','kulutus');p.click('[data-assistant-send]')
        assert 'kWh' not in p.locator('.assistant-local-result').inner_text()
        assert len(json.load(urllib.request.urlopen(url+'/calls')))==2
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_public_origin_closed(browser,base):
    ctx=browser.new_context();ctx.add_init_script("window.AjouraAssistantFixtureTransport={request:()=>{throw Error('must stay closed')},ready:()=>true};")
    ctx.route('https://ajoura-app.github.io/**',lambda route:route.fulfill(path=str(JUURI/(route.request.url.split('github.io/')[1].split('?')[0] or 'index.html'))))
    try:
        p=ctx.new_page();p.goto('https://ajoura-app.github.io/app.html');p.wait_for_function('!!window.AjouraApp')
        assert p.evaluate('window.AjouraAssistant===undefined')
    finally:ctx.close()

@pytest.mark.parametrize('change',['vehicle','session','local-edit','opt-out'])
def test_pending_result_isolation(browser,base,local_api,change):
    request,url=local_api;s=avaa(browser,base,'home',autot=tiedot.talli(),kello=KELLO)
    try:
        bind(s,request);p=s.page;p.check('[data-assistant-opt]')
        p.evaluate("()=>{window.AjouraAssistantFixtureTransport.request=b=>b.action==='answer'?new Promise(resolve=>window.__resume=async()=>resolve(await window.assistantRequest(b))):window.assistantRequest(b);}")
        p.fill('.assistant-local input[type=text]','kulutus');p.click('[data-assistant-send]');p.wait_for_function('!!window.__resume')
        if change=='vehicle':p.click('[data-secretary-car=tst2]')
        elif change=='session':p.evaluate("document.dispatchEvent(new Event('ajoura-session'))")
        elif change=='local-edit':p.evaluate('AjouraApp.state().cars[0].km++')
        else:p.uncheck('[data-assistant-opt]')
        p.evaluate('window.__resume()');p.wait_for_timeout(100)
        assert 'l/100 km' not in p.locator('.assistant-local-result').inner_text()
        assert 'kWh/100 km' not in p.locator('.assistant-local-result').inner_text()
    finally:s.sulje()


def test_local_edit_blocks_provider(browser,base,local_api):
    request,url=local_api;s=avaa(browser,base,'home',autot=tiedot.talli(),kello=KELLO)
    try:
        bind(s,request);p=s.page;p.check('[data-assistant-opt]');p.evaluate('AjouraApp.state().cars[0].km++')
        p.fill('.assistant-local input[type=text]','kulutus');p.click('[data-assistant-send]')
        p.wait_for_function("document.querySelector('.assistant-local-result').textContent.includes('Synkronoi')")
        assert json.load(urllib.request.urlopen(url+'/calls'))==[]
    finally:s.sulje()


def test_no_deployment_entry():
    config=(JUURI/'supabase/config.toml').read_text()
    assert '[functions.avustaja]' not in config
    assert not (JUURI/'supabase/functions/avustaja/index.ts').exists()


def test_sync_readiness_tracks_real_local_data(browser,base):
    from test_plus import palvelu,PLUS
    s=avaa(browser,base,'home',autot=tiedot.talli(),kello=KELLO)
    try:
        p=s.page;palvelu(s,oikeus=PLUS);p.wait_for_function('AjouraSync.analysisReady()')
        p.evaluate('AjouraApp.state().cars[0].km++');assert not p.evaluate('AjouraSync.analysisReady()')
        p.evaluate('AjouraApp.state().cars[0].km--');assert p.evaluate('AjouraSync.analysisReady()')
        p.click('[data-secretary-mode=manual]');assert not p.evaluate('AjouraSync.analysisReady()')
        p.keyboard.press('Escape');assert p.evaluate('AjouraSync.analysisReady()')
        p.evaluate('AjouraSync.forget()');assert not p.evaluate('AjouraSync.analysisReady()')
    finally:s.sulje()


def test_node_contracts():
    result=subprocess.run(['node','--test','--test-reporter=tap','testit/analytiikka.test.cjs','paikallinen/avustaja.test.mjs'],cwd=JUURI,capture_output=True,text=True)
    assert result.returncode==0,(result.stdout+result.stderr)[-4000:]
    assert '# fail 0' in result.stdout
