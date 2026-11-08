"""The requested Ajoura 2.0 version must agree in the app and landing in every language."""
import re
import pytest,tiedot
from conftest import JUURI
from apu import avaa,KELLO

@pytest.mark.parametrize('lang,suffix,prefix',[
    ('fi','(testiversio)','TESTIVERSIO'),
    ('en','(test version)','TEST VERSION'),
    ('sv','(testversion)','TESTVERSION'),
])
def test_ajoura_2_0_versionaytto(browser,base,lang,suffix,prefix):
    # Keep the approved major version while allowing normal 2.01, 2.02, ... updates.
    version=re.search(r"appVersion='(\d+\.\d+) \(testiversio\)'",(JUURI/'app.js').read_text())[1]
    assert version.split('.')[0]=='2'
    app=f'AJOURA {version} {suffix}'
    year=re.search(r'TESTIVERSIO \d+\.\d+ / (\d{4})',(JUURI/'index.html').read_text())[1]
    landing=f'{prefix} {version} / {year}'
    s=avaa(browser,base,'menu',autot=tiedot.talli(),kieli=lang,kello=KELLO)
    try:
        p=s.page;before=s.talli()
        assert p.inner_text('.menu-version')==app
        assert p.evaluate('AjouraApp.version')==f'{version} (testiversio)'
        assert s.talli()==before
        p.goto(base+'/index.html');p.wait_for_load_state('load')
        assert p.get_by_text(landing,exact=True).count()==1
        assert not s.virheet,s.virheet
    finally:s.sulje()
