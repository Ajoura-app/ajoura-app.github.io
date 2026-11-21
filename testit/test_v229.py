"""2.29: Tyhjennä tiedot odottaa, että laitteen tietokanta (IndexedDB) on tyhjennetty, ennen kuin näkymä vaihtuu.

Ennen: tallin kopio ja taustanpoistetut autokuvat poistettiin taustalla. Jos sovellus suljettiin heti tyhjennyksen
jälkeen, taustanpoistettu kuva saattoi jäädä laitteelle (test_v202 kaatui satunnaisesti raskaan kuorman aikana).
"""
import tiedot
from apu import avaa

HIDAS = """() => { const c = AjouraCarPhoto.clear; window.__tyhjennetty = false;
  AjouraCarPhoto.clear = () => new Promise(r => setTimeout(r, 800)).then(c).then(() => { window.__tyhjennetty = true; }); }"""


def test_tyhjennys_odottaa_tietokantaa(browser, base):
    autot = tiedot.talli()
    autot[0]["photo"] = tiedot.jpeg()
    s = avaa(browser, base, "me", autot=autot)
    try:
        p = s.page
        alkup = autot[0]["photo"]
        p.evaluate("([s, k]) => AjouraCarPhoto.remember(s, k)", [alkup, "data:image/png;base64,iVBORw0KGgo="])
        assert p.evaluate("s => AjouraCarPhoto.display(s)", alkup).startswith("data:image/png")
        p.evaluate(HIDAS)
        p.locator("[data-reset]").click()
        # Näkymä vaihtuu vasta, kun kuvien poisto on valmis (hidas tietokanta).
        p.wait_for_function("location.hash !== '#me'", timeout=5000)
        assert p.evaluate("window.__tyhjennetty") is True
        p.reload()
        p.evaluate("AjouraCarPhoto.ready")
        assert p.evaluate("s => AjouraCarPhoto.display(s)", alkup) == alkup, "taustanpoistettu kuva jäi laitteelle"
        assert p.evaluate("AjouraApp.cars().length") == 0
        assert p.evaluate("""() => new Promise(ok => { const r = indexedDB.open('ajoura', 1);
          r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').count(); g.onsuccess = () => ok(g.result); }; })""") == 0
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
