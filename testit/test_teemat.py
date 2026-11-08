"""Teemat: Alkuperäinen, neljä aiempaa teemaa sekä Garage, Copilot, Nordic ja Journey.

- Värit ovat app.css:ssä muodossa var(--c-xxxxxx,#xxxxxx): alkuperäinen väri on varaväri, joten Alkuperäinen-teema
  (oletus) ei muutu eikä riipu teemat.css:stä. tyokalut/teemat.py pitää värit ja teemat.css:n ajan tasalla.
- Valinta tallentuu laitteelle (localStorage ajoura-ulkoasu) ja näkyy heti ja uudelleenavauksessa.
- Vanha tumma tila (ajoura-theme=dark) säilyy Alkuperäisessä teemassa; uusissa teemoissa ei käänteissuodatinta.
- Jokaisessa teemassa tekstien kontrasti on vähintään yhtä hyvä kuin Alkuperäisessä (tai vähintään 4,5:1).
"""
import re
import subprocess
import sys
from pathlib import Path

import pytest

import tiedot
from apu import KELLO, avaa, odota_nakyma
from conftest import JUURI

VANHAT_TEEMAT = ["auto", "eko", "blue-track", "premium"]
UUDET_TEEMAT = ["garage", "copilot", "nordic", "journey"]
TEEMAT = VANHAT_TEEMAT + UUDET_TEEMAT
TAUSTA = {"auto": "rgb(245, 244, 242)", "eko": "rgb(243, 247, 242)", "blue-track": "rgb(9, 29, 48)",
          "premium": "rgb(243, 236, 230)", "garage": "rgb(7, 17, 16)", "copilot": "rgb(14, 16, 37)",
          "nordic": "rgb(243, 247, 245)", "journey": "rgb(16, 25, 22)"}
NAKYMAT = ["car-order", "home", "fuel/tst1", "reports", "vehicle/tst1", "event/tst1/e1", "add/tst1", "report/tst1",
           "notes/tst1", "menu", "settings", "theme", "tips", "me"]


def test_generaattori_ajan_tasalla():
    """app.css:ssä ja roles.css:ssä ei ole teemoista puuttuvia värejä, ja teemat.css vastaa generaattoria.
    Jos tämä kaatuu: aja python3 tyokalut/teemat.py (ks. ohje tiedoston alussa)."""
    r = subprocess.run([sys.executable, "-I", str(JUURI / "tyokalut" / "teemat.py"), "--tarkista"],
                       capture_output=True, text=True, cwd=JUURI)
    assert r.returncode == 0, r.stdout + r.stderr


def test_varavari_on_alkuperainen():
    """Jokaisen muuttujan nimi ja varaväri ovat sama väri: Alkuperäinen-teema näyttää täsmälleen samalta kuin ennen."""
    vaarat = []
    for f in ("app.css", "roles.css"):
        for nimi, vara in re.findall(r"var\(--c-([0-9a-f]+),(#[0-9a-fA-F]+|white)\)", (JUURI / f).read_text()):
            h = "ffffff" if vara == "white" else vara[1:].lower()
            if len(h) in (3, 4):
                h = "".join(c * 2 for c in h)
            if h != nimi:
                vaarat.append(f"{f}: --c-{nimi} / {vara}")
    assert not vaarat, vaarat[:10]


def test_alkuperainen_oletuksena(browser, base):
    s = avaa(browser, base, "home", autot=tiedot.talli(), kello=KELLO)
    try:
        h = s.page.evaluate("[document.documentElement.getAttribute('data-theme'), getComputedStyle(document.querySelector('.garage-row')).backgroundColor,"
                            "getComputedStyle(document.querySelector('.device-glass')).backgroundColor]")
        assert h == [None, "rgb(255, 255, 255)", "rgb(245, 248, 252)"], h
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_vanha_tumma_tila_sailyy(browser, base):
    """Ennen 0.110:tä valittu tumma tila jää voimaan Alkuperäisessä teemassa, ja Asetukset kertoo sen."""
    s = avaa(browser, base, "settings", autot=tiedot.talli(), teema="dark", kello=KELLO)
    try:
        assert s.page.evaluate("document.documentElement.classList.contains('dark')")
        assert "Alkuperäinen · Tumma" in s.page.inner_text(".th-row")
    finally:
        s.sulje()


def test_teeman_vaihto_ja_pysyvyys(browser, base):
    s = avaa(browser, base, "settings", autot=tiedot.talli(), teema="dark", kello=KELLO, asennettu=True, ios=True)
    p = s.page
    try:
        p.click(".th-row a[href='#theme']")
        odota_nakyma(s, "theme")
        assert p.locator("[data-th-pick]").count() == 9
        assert p.locator(".th-opt.on [data-th-pick=nykyinen]").count() == 1
        assert p.locator("[data-th-apply]").count() == 0, "Käytössä olevalla teemalla ei Ota käyttöön -painiketta"
        p.click("[data-th-pick=eko]")
        assert p.get_attribute("[data-th-pick=eko]", "aria-checked") == "true"
        assert p.evaluate("document.documentElement.getAttribute('data-theme')") is None, "valinta ei vielä vaihda"
        p.click(".th-opt.on [data-th-apply]")
        p.wait_for_timeout(200)
        tila = p.evaluate("[document.documentElement.getAttribute('data-theme'), document.documentElement.classList.contains('dark'),"
                          "localStorage.getItem('ajoura-ulkoasu'), getComputedStyle(document.querySelector('.device-glass')).backgroundColor,"
                          "document.querySelector('meta[name=theme-color]').content]")
        assert tila == ["eko", False, "eko", TAUSTA["eko"], "#f3f7f2"], tila
        assert "Teema otettu käyttöön" in p.inner_text(".th-opt.on")
        # Uudelleenavaus: teema säilyy ja näkyy heti (app.html:n alussa, ennen sovelluksen skriptejä)
        p.reload()
        p.wait_for_selector("#app-screen .screen-content")
        assert p.evaluate("document.documentElement.getAttribute('data-theme')") == "eko"
        p.goto(base + "/app.html#settings")
        p.wait_for_timeout(300)
        assert "Eko" in p.inner_text(".th-row")
        # Paluu Alkuperäiseen vaaleana
        p.goto(base + "/app.html#theme")
        p.wait_for_timeout(300)
        p.click("[data-th-mode=light]")
        p.click(".th-opt.on [data-th-apply]")
        p.wait_for_timeout(200)
        assert p.evaluate("[document.documentElement.getAttribute('data-theme'), document.documentElement.classList.contains('dark'),"
                          "localStorage.getItem('ajoura-ulkoasu'), localStorage.getItem('ajoura-theme')]") == [None, False, "nykyinen", "light"]
        p.click(".nav-back")
        odota_nakyma(s, "settings")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_koko_kuva_aukeaa(browser, base):
    s = avaa(browser, base, "theme", autot=tiedot.talli(), kello=KELLO)
    p = s.page
    try:
        p.click("[data-th-full=premium]")
        p.wait_for_selector("dialog.th-viewer[open] img")
        p.wait_for_function("document.querySelector('dialog.th-viewer img').naturalWidth > 0")
        p.click("dialog.th-viewer button")
        p.wait_for_selector("dialog.th-viewer", state="detached", timeout=2000)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tumma_tila_vain_alkuperaisessa(browser, base):
    """Tumma tila on Alkuperäisen teeman käänteissuodatin: uusissa teemoissa sitä ei käytetä."""
    s = avaa(browser, base, "home", autot=tiedot.talli(), teema="dark", extra={"ajoura-ulkoasu": "premium"}, kello=KELLO)
    try:
        assert s.page.evaluate("[document.documentElement.classList.contains('dark'), getComputedStyle(document.querySelector('.device-glass')).filter]") == [False, "none"]
    finally:
        s.sulje()


# Kontrasti: jokaisen näkyvän tekstin väri suhteessa sen taustaan. Tausta haetaan ylöspäin vanhemmista
# (läpinäkyvät värit yhdistetään; liukuväreistä käytetään jokaista väriä ja pienin kontrasti ratkaisee).
KONTRASTI = r"""() => {
  const rgba = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (a, b) => { const al = a[3] + b[3] * (1 - a[3]); if (!al) return [255, 255, 255, 0]; return [0, 1, 2].map(i => (a[i] * a[3] + b[i] * b[3] * (1 - a[3])) / al).concat(al); };
  const lum = c => { const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const backs = el => {
    let layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e), bg = rgba(cs.backgroundColor), img = cs.backgroundImage;
      const stops = /gradient/.test(img) ? (img.match(/rgba?\([^)]+\)/g) || []).map(rgba).filter(c => c[3] > 0.05) : [];
      layers.push({bg, stops});
      if ((bg && bg[3] >= 0.99) || stops.some(c => c[3] >= 0.99)) break;
    }
    let base = [[255, 255, 255, 1]];
    for (const L of layers.reverse()) {
      if (L.bg && L.bg[3] > 0) base = base.map(b => over(L.bg, b));
      if (L.stops.length) base = L.stops.flatMap(s => base.map(b => over(s, b)));
    }
    return base;
  };
  const out = [];
  const root = document.querySelector('#app-screen');
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const polku = el => { const p = []; for (let e = el; e && e !== root; e = e.parentElement) p.push(e.tagName + ':' + [...e.parentElement.children].indexOf(e)); return p.reverse().join('>'); };
  let n;
  while ((n = w.nextNode())) {
    const el = n.parentElement, t = n.textContent.trim(), i = polku(el) + '|' + [...el.childNodes].indexOf(n);
    if (!t || !/[A-Za-zÅÄÖåäö0-9]/.test(t) || el.closest('svg, [aria-hidden=true], .sr-only, .car-stage')) continue;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const c = rgba(cs.color); if (!c) continue;
    const bs = backs(el), fc = bs.map(b => over(c, b));
    const k = Math.min(...bs.map((b, j) => ratio(fc[j], b)));
    const iso = parseFloat(cs.fontSize) >= 18.66 || (parseFloat(cs.fontSize) >= 14 && +cs.fontWeight >= 700);
    out.push({i, t: t.slice(0, 40), k: Math.round(k * 100) / 100, iso, sel: el.tagName.toLowerCase() + '.' + [...el.classList].join('.')});
  }
  return out;
}"""


def _kontrastit(browser, base, nakyma, teema):
    extra = {"ajoura-ulkoasu": teema} if teema else {}
    s = avaa(browser, base, nakyma, autot=tiedot.talli(), kello=KELLO, asennettu=True, ios=True, extra=extra)
    try:
        s.page.wait_for_timeout(300)
        assert not s.virheet, f"{teema} #{nakyma}: " + "; ".join(s.virheet)
        return {x["i"]: x for x in s.page.evaluate(KONTRASTI)}
    finally:
        s.sulje()


@pytest.mark.parametrize("nakyma", NAKYMAT)
def test_kontrasti_vahintaan_alkuperaisen_tasoa(browser, base, nakyma):
    alku = _kontrastit(browser, base, nakyma, None)
    virheet = []
    for teema in TEEMAT:
        t = _kontrastit(browser, base, nakyma, teema)
        for i, x in t.items():
            a = alku.get(i)
            raja = 3.0 if x["iso"] else 4.5
            vaatimus = min(raja, a["k"]) - 0.25 if a and a["t"] == x["t"] else raja
            if x["k"] < vaatimus:
                virheet.append(f"{teema}: '{x['t']}' ({x['sel']}) {x['k']}:1 < {vaatimus:.2f}")
    assert not virheet, f"#{nakyma}: " + "; ".join(virheet[:12])


@pytest.mark.parametrize("teema", TEEMAT)
def test_teema_koko_sovelluksessa(browser, base, teema):
    """Teema näkyy kaikissa keskeisissä näkymissä (tausta, kortit, alavalikko ja kelluva ＋), ei vain etusivulla."""
    s = avaa(browser, base, "home", autot=tiedot.talli(), kello=KELLO, asennettu=True, ios=True, extra={"ajoura-ulkoasu": teema})
    p = s.page
    try:
        for v in ["home", "fuel/tst1", "reports", "vehicle/tst1", "menu", "settings", "theme", "add/tst1"]:
            p.goto(base + "/app.html#" + v)
            p.wait_for_timeout(250)
            assert p.evaluate("document.documentElement.getAttribute('data-theme')") == teema
            assert p.evaluate("getComputedStyle(document.querySelector('#app-screen')).backgroundColor") == TAUSTA[teema], v
            nav = p.evaluate("(() => { const a = document.querySelector('.tab-bar.main-tabs a[aria-current]'); return a ? getComputedStyle(a).backgroundColor : null; })()")
            if nav:
                assert nav not in ("rgb(223, 234, 253)",), f"#{v}: alavalikon valittu välilehti alkuperäisen sininen"
            fab = p.evaluate("(() => { const a = document.querySelector('.tab-fab'); return a ? getComputedStyle(a).backgroundColor : null; })()")
            if fab:
                assert fab != "rgb(223, 234, 253)", f"#{v}: kelluva ＋ alkuperäisen sininen"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_teemat_tiedosto_offline_osassa():
    sw = (JUURI / "sw.js").read_text()
    assert "'teemat.css'" in sw
    html = (JUURI / "app.html").read_text()
    assert re.search(r'href="teemat\.css\?v=ak-\d+"', html)
    for t in ["nykyinen"] + TEEMAT:
        assert (JUURI / "teemakuvat" / f"{t}.webp").is_file() and (JUURI / "teemakuvat" / f"{t}-pieni.webp").is_file()


@pytest.mark.parametrize("teema", TEEMAT)
def test_ei_vaakavieritysta_teemoissa(browser, base, teema):
    """Teemojen erot (esim. Premiumin päätekirjasin, Ekon pyöreämmät kortit) eivät levitä näkymää 320 px:llä."""
    from test_leveys import MITTAUS, NAKYMAT as LEVEYS_NAKYMAT
    s = avaa(browser, base, "home", autot=tiedot.talli(), leveys=320, korkeus=800, kello=KELLO, extra={"ajoura-ulkoasu": teema})
    virheet = []
    try:
        for v in LEVEYS_NAKYMAT:
            s.page.goto(base + "/app.html#" + v)
            s.page.wait_for_timeout(200)
            m = s.page.evaluate(MITTAUS)
            if m["yli"] > 0:
                virheet.append(f"#{v}: {m['yli']} px yli (pisin {m['pisin']})")
        assert not virheet, f"{teema} 320 px: " + "; ".join(virheet)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()

@pytest.mark.parametrize('teema', UUDET_TEEMAT)
def test_ai_first_vaihto_pysyvyys_ja_hahmo(browser, base, teema):
    """A new palette changes immediately, keeps the garage and preserves the avatar."""
    s=avaa(browser,base,'theme',autot=tiedot.talli(),kello=KELLO,extra={'ajoura-ulkoasu':'auto'})
    p=s.page
    try:
        before=s.talli()
        p.evaluate("window.__themeTestMarker=123")
        p.click(f'[data-th-pick={teema}]')
        p.click('.th-opt.on [data-th-apply]')
        assert p.evaluate('window.__themeTestMarker')==123, 'Theme change reloaded the app'
        assert p.evaluate("document.documentElement.getAttribute('data-theme')")==teema
        assert s.talli()==before
        p.goto(base+'/app.html#home')
        p.wait_for_selector('.secretary-card')
        assert p.get_attribute('.secretary-intro img','src')=='hahmot/emma.webp'
        p.reload();p.wait_for_selector('.secretary-card')
        assert p.evaluate("localStorage.getItem('ajoura-ulkoasu')")==teema
        assert s.talli()==before
        # Test the initial HTML before app.js can apply a theme itself.
        p.route('**/app.js?*',lambda route:route.abort())
        p.reload(wait_until='domcontentloaded')
        assert p.evaluate("document.documentElement.getAttribute('data-theme')")==teema
    finally:s.sulje()

@pytest.mark.parametrize('teema', ['nykyinen']+VANHAT_TEEMAT)
def test_ai_first_sailyttaa_vanhan_valinnan(browser, base, teema):
    s=avaa(browser,base,'theme',autot=tiedot.talli(),kello=KELLO,extra={'ajoura-ulkoasu':teema})
    try:
        assert s.page.locator('[data-th-pick]').count()==9
        assert s.page.locator(f'.th-opt.on [data-th-pick={teema}]').count()==1
        s.page.reload();s.page.wait_for_selector('[data-th-pick]')
        assert s.page.evaluate("localStorage.getItem('ajoura-ulkoasu')")==teema
    finally:s.sulje()

@pytest.mark.parametrize('teema', UUDET_TEEMAT)
@pytest.mark.parametrize('width', [320,375,390,430])
def test_ai_first_mobiili(browser, base, teema, width):
    s=avaa(browser,base,'home',autot=tiedot.talli(),kello=KELLO,leveys=width,asennettu=True,extra={'ajoura-ulkoasu':teema})
    try:
        for view in ['home','theme']:
            s.page.goto(base+'/app.html#'+view);s.page.wait_for_timeout(200)
            assert s.page.evaluate("document.querySelector('#app-screen').scrollWidth<=document.querySelector('#app-screen').clientWidth")
        assert not s.virheet,s.virheet
    finally:s.sulje()

@pytest.mark.parametrize('teema', UUDET_TEEMAT)
@pytest.mark.parametrize('kieli', ['fi','en','sv'])
def test_ai_first_kielet(browser, base, teema, kieli):
    s=avaa(browser,base,'theme',autot=tiedot.talli(),kello=KELLO,kieli=kieli,leveys=320,extra={'ajoura-ulkoasu':teema})
    try:
        assert s.page.locator('[data-th-pick]').count()==9
        if kieli!='fi':
            text=s.page.inner_text('#app-screen')
            assert 'Aiemmat teemat' not in text
            assert 'Metsänvihreä ja lämmin kulta.' not in text
        assert not s.virheet,s.virheet
    finally:s.sulje()


def test_ai_first_teemat_offline(browser):
    """New palettes and previews work without a network; switching keeps garage data."""
    from test_offline import Palvelin, Kayttaja
    server=Palvelin(JUURI)
    k=Kayttaja(browser,server,tiedot.talli())
    try:
        k.asenna()
        before=k.talli()
        k.ctx.set_offline(True)
        for theme in UUDET_TEEMAT:
            k.avaa('theme')
            k.page.click(f'[data-th-pick={theme}]')
            k.page.click('.th-opt.on [data-th-apply]')
            assert k.page.evaluate("document.documentElement.getAttribute('data-theme')")==theme
            for suffix in ['', '-pieni']:
                assert k.hae(f'teemakuvat/{theme}{suffix}.webp')[0]
            k.avaa('home')
            assert k.page.get_attribute('.secretary-intro img','src')=='hahmot/emma.webp'
            assert k.talli()==before
        assert not k.virheet,k.virheet
    finally:
        k.sulje();server.sulje()
