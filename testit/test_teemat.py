"""Teemat (2.11): käytössä on vain Alkuperäinen teema ja sen tumma tila.

- Muut teemat poistettiin käyttäjän päätöksellä 12.11.2026 (yksi teema valmiiksi ennen uusia).
- Vanha teemavalinta (localStorage ajoura-ulkoasu) jätetään huomiotta: näkymä on Alkuperäinen.
- Vaalea tai tumma tila valitaan Asetuksista (localStorage ajoura-theme); vanha #theme-osoite ohjaa Asetuksiin.
- Värit ovat app.css:ssä yhä muodossa var(--c-xxxxxx,#xxxxxx), ja tyokalut/teemat.py pitää ne ajan tasalla uutta
  teemaa varten.
"""
import re
import subprocess
import sys
from pathlib import Path

import pytest

import tiedot
from apu import KELLO, avaa, odota_nakyma
from conftest import JUURI

POISTETUT = ["auto", "eko", "blue-track", "premium", "garage", "copilot", "nordic", "journey"]


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
    """2.09: the default light theme keeps its page colour and uses a beige vehicle scene."""
    s = avaa(browser, base, "home", autot=tiedot.talli(), kello=KELLO)
    try:
        h = s.page.evaluate("[document.documentElement.getAttribute('data-theme'), getComputedStyle(document.querySelector('.garage-row')).backgroundColor,"
                            "getComputedStyle(document.querySelector('.device-glass')).backgroundColor]")
        assert h == [None, "rgb(233, 222, 206)", "rgb(245, 248, 252)"], h
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# Muut testit (esim. test_landing.py, test_teemat_visuaaliset.py) käyttävät tätä kontrastimittausta.
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


@pytest.mark.parametrize("vanha", POISTETUT)
def test_vanha_teemavalinta_ohitetaan(browser, base, vanha):
    """Aiemmin muun teeman valinnut näkee Alkuperäisen vaalean ilmeen; tallennetut tiedot eivät muutu."""
    s = avaa(browser, base, "home", autot=tiedot.talli(), kello=KELLO, extra={"ajoura-ulkoasu": vanha})
    try:
        p = s.page
        ennen = s.talli()
        tila = p.evaluate("[document.documentElement.getAttribute('data-theme'), document.documentElement.classList.contains('dark'),"
                          "getComputedStyle(document.querySelector('.device-glass')).backgroundColor]")
        assert tila == [None, False, "rgb(245, 248, 252)"], tila
        assert s.talli() == ennen
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tumma_tila_asetuksista_ja_pysyvyys(browser, base):
    s = avaa(browser, base, "settings", autot=tiedot.talli(), kello=KELLO)
    try:
        p = s.page
        ennen = s.talli()
        assert p.locator("[data-th-pick], .th-row, a[href='#theme']").count() == 0
        p.locator('.me-data [data-pref=Teema][data-value=dark]').click()
        assert p.evaluate("document.documentElement.classList.contains('dark')")
        assert p.evaluate("localStorage.getItem('ajoura-theme')") == "dark"
        assert p.locator('.me-data [data-pref=Teema][data-value=dark]').get_attribute('aria-pressed') == 'true'
        p.reload()
        p.wait_for_selector('.me-data')
        assert p.evaluate("document.documentElement.classList.contains('dark')")
        assert "invert(1)" in p.evaluate("getComputedStyle(document.querySelector('.device-glass')).filter")
        p.locator('.me-data [data-pref=Teema][data-value=light]').click()
        assert not p.evaluate("document.documentElement.classList.contains('dark')")
        assert s.talli() == ennen
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_vanha_teemasivu_ohjaa_asetuksiin(browser, base):
    s = avaa(browser, base, "theme", autot=tiedot.talli(), kello=KELLO)
    try:
        s.page.wait_for_function("location.hash === '#settings'")
        assert s.page.locator('.me-data [data-pref=Teema]').count() == 2
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_muiden_teemojen_koodi_ja_kuvat_poistettu():
    for f in ["teemat.css", "kaynnistys.css", "tervetuloa.css", "app.js", "app.html", "autosihteeri.js"]:
        t = (JUURI / f).read_text()
        assert not re.search(r"\[data-theme=|data-theme=\\?\"?(garage|copilot|nordic|journey|auto|eko|blue-track|premium)", t), f
        assert "secretary-cinematic" not in t and "data-th-pick" not in t, f
    assert not (JUURI / "teemakuvat").exists()
    sw = (JUURI / "sw.js").read_text()
    assert "teemakuvat/" not in sw and "-room.webp'" not in sw.replace("'ui-art/garage-room.webp'", "")
    assert "'teemat.css'" in sw
    assert re.search(r'href="teemat\.css\?v=ak-\d+"', (JUURI / "app.html").read_text())
    assert "teemakuvat/" not in (JUURI / "index.html").read_text()
