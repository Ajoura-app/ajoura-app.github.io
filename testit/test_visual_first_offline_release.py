"""All visual-first artwork is ready offline immediately after a clean installation."""
from pathlib import Path
import tiedot
from conftest import JUURI
from test_offline import Palvelin,Kayttaja,sw_tiedot


def test_kaikki_teemakuvat_kylmassa_offline_asennuksessa(browser):
    server=Palvelin(JUURI);user=Kayttaja(browser,server,tiedot.talli())
    try:
        user.asenna();before=user.talli();idb=user.indexeddb()
        _,cache,_=sw_tiedot(JUURI)
        artwork={str(p.relative_to(JUURI)) for p in (Path(JUURI)/'ui-art').glob('*.webp')}
        assert len(artwork)>=5
        cached=user.page.evaluate('(name)=>caches.open(name).then(c=>c.keys()).then(rs=>rs.map(r=>new URL(r.url).pathname.substring(1)))',cache)
        assert artwork<=set(cached),'Artwork missing from a clean install before a theme has been visited'
        user.ctx.set_offline(True)
        for file in sorted(artwork):
            result=user.page.evaluate('''file=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve({ok:true,width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>resolve({ok:false});image.src=new URL(file,location.href).href})''',file)
            assert result['ok'] and result['width']>0 and result['height']>0,(file,result)
        for theme in ['garage','copilot','nordic','journey']:
            user.avaa('theme');p=user.page
            p.locator(f'[data-th-pick={theme}]').click()
            p.locator('[data-th-apply]').click()
            user.avaa('home')
            assert p.locator('.secretary-cinematic').is_visible()
            assert p.locator('.secretary-intro img').evaluate('(e)=>e.complete&&e.naturalWidth===512')
            assert f'{theme}-room.webp' in p.locator('.secretary-hero-media').evaluate('(e)=>getComputedStyle(e).backgroundImage')
        assert user.talli()==before and user.indexeddb()==idb
        assert not user.virheet,user.virheet
    finally:
        user.sulje();server.sulje()
