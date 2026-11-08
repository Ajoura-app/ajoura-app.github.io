"""The requested Ajoura 2.0 version must agree in the app and landing in every language."""
import pytest,tiedot
from apu import avaa,KELLO

@pytest.mark.parametrize('lang,app,landing',[
    ('fi','AJOURA 2.0 (testiversio)','TESTIVERSIO 2.0 / 2026'),
    ('en','AJOURA 2.0 (test version)','TEST VERSION 2.0 / 2026'),
    ('sv','AJOURA 2.0 (testversion)','TESTVERSION 2.0 / 2026'),
])
def test_ajoura_2_0_versionaytto(browser,base,lang,app,landing):
    s=avaa(browser,base,'menu',autot=tiedot.talli(),kieli=lang,kello=KELLO)
    try:
        p=s.page;before=s.talli()
        assert p.inner_text('.menu-version')==app
        assert p.evaluate('AjouraApp.version')=='2.0 (testiversio)'
        assert s.talli()==before
        p.goto(base+'/index.html');p.wait_for_load_state('load')
        assert p.get_by_text(landing,exact=True).count()==1
        assert not s.virheet,s.virheet
    finally:s.sulje()
