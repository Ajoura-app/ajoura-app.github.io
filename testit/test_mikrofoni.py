"""Mikrofoni tekoälytilassa (v1.21): selaimen oma puheentunnistus (Web Speech API) muuttaa puheen tekstiksi tekstikenttään.
Käyttäjä näkee ja voi korjata tekstin; mitään ei lähetetä ennen Lähetä-painiketta. Painike näkyy vain, jos selain tukee
puheentunnistusta. Toinen painallus lopettaa kuuntelun; ikkunan sulkeminen keskeyttää sen.

Puheentunnistus on keksitty (KEKSITTY_PUHE): oikeaa mikrofonia tai selaimen valmistajan palvelua ei käytetä.
"""
import json

import pytest

import tiedot
from apu import KELLO, TANAAN, avaa, ikkuna_valmis
from test_plus import PLUS, palvelu

# Keksitty SpeechRecognition: tallentaa kielen ja kutsut, antaa ensin välituloksen ja sitten lopullisen tekstin.
# window.__puhe: tulos (teksti, '' = ei puhetta), virhe (esim. 'not-allowed'), viive (ms ennen tulosta), tila (1.22, iPhonen
# vikatilanteet): 'jumissa' = ei mitään tapahtumia, 'stopilla' = tulos vasta lopetettaessa, 'ei_loppua' = selain ei päätä lopetusta.
KEKSITTY_PUHE = """(() => {
  window.__puhe = { lang: null, interim: null, started: 0, stopped: 0, aborted: 0, tulos: 'Tankkasin 45,6 litraa dieseliä 84,77 euroa mittari 153100', virhe: null, viive: 60 };
  class Puhe {
    start() {
      const p = window.__puhe; p.started++; p.lang = this.lang; p.interim = this.interimResults;
      if (p.tila === 'jumissa') return;
      if (p.tila === 'stopilla' || p.tila === 'ei_loppua') { setTimeout(() => this.onaudiostart && this.onaudiostart(), 20); return; }
      this._t = setTimeout(() => {
        if (p.virhe) { this.onerror && this.onerror({ error: p.virhe }); this.onend && this.onend(); return; }
        const tulos = (t, valmis) => { const r = [{ transcript: t, confidence: 0.9 }]; r.isFinal = valmis; return r; };
        if (p.tulos) {
          this.onresult && this.onresult({ resultIndex: 0, results: [tulos(p.tulos.slice(0, 9), false)] });
          this.onresult && this.onresult({ resultIndex: 0, results: [tulos(p.tulos, true)] });
        }
        this.onend && this.onend();
      }, p.viive);
    }
    stop() {
      const p = window.__puhe; p.stopped++; clearTimeout(this._t);
      if (p.tila === 'ei_loppua') return;
      if (p.tila === 'stopilla' && p.tulos) { const r = [{ transcript: p.tulos, confidence: 0.9 }]; r.isFinal = true; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); }
      this.onend && this.onend();
    }
    abort() {
      const p = window.__puhe; p.aborted++; clearTimeout(this._t);
      if (p.tila === 'jumissa' || p.tila === 'ei_loppua') return;
      this.onerror && this.onerror({ error: 'aborted' }); this.onend && this.onend();
    }
  }
  window.SpeechRecognition = Puhe; window.webkitSpeechRecognition = Puhe;
})()"""
EI_PUHETTA = "window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined;"
TEKSTI = {"kind": "text", "date": None, "quantity": 45.6, "unit": "l", "price_per_unit": 1.859, "total": 84.77,
          "currency": "EUR", "fuel": "diesel", "mismatch": False, "odometer": 153100, "odometer_unit": "km"}


def avaa_plus(browser, base, puhe=KEKSITTY_PUHE, **k):
    s = avaa(browser, base, "fuel/tst1", autot=tiedot.talli(), kello=KELLO, extra={"ajoura-tekoaly": "1"}, **k)
    tila = palvelu(s, oikeus=PLUS)
    s.page.evaluate(puhe)
    s.page.click(".fl-add")
    ikkuna_valmis(s.page)
    return s, tila


def puhe(pg):
    return pg.evaluate("window.__puhe")


def viesti(pg, teksti):
    pg.wait_for_function("t => (document.querySelector('.ai-note')||{}).textContent?.includes(t)", arg=teksti)


def test_puhe_tekstikenttaan_ei_lahetetä_itsestaan(browser, base):
    s, tila = avaa_plus(browser, base)
    try:
        pg = s.page
        assert "puheella" in pg.inner_text(".ai-lead")
        pg.click("[data-ai-mic]")
        assert pg.get_attribute("[data-ai-mic]", "aria-pressed") == "true"
        viesti(pg, "Tarkista teksti ja paina Lähetä")
        assert pg.input_value("#ai-say-in") == "Tankkasin 45,6 litraa dieseliä 84,77 euroa mittari 153100"
        assert pg.get_attribute("[data-ai-mic]", "aria-pressed") == "false"
        assert pg.evaluate("document.activeElement.hasAttribute('data-ai-send')"), "kohdistus Lähetä-painikkeeseen (ei näppäimistöä)"
        p = puhe(pg)
        assert p["lang"] == "fi-FI" and p["interim"] is True and p["started"] == 1
        pg.wait_for_timeout(200)
        assert tila["ai"] == [], "puhe ei saa lähteä tekoälylle ennen Lähetä-painiketta"
        # Käyttäjä korjaa ja lähettää: teksti kulkee kuten kirjoitettu teksti.
        pg.fill("#ai-say-in", pg.input_value("#ai-say-in").replace("153100", "153 100"))
        tila["ai_vastaus"] = TEKSTI
        pg.click("[data-ai-send]")
        pg.wait_for_function("() => /tekstistä/.test(document.querySelector('.sf-ai-note').textContent)")
        assert json.loads(tila["ai_pyynnot"][0]["runko"]) == {"text": "Tankkasin 45,6 litraa dieseliä 84,77 euroa mittari 153 100", "today": TANAAN}
        assert pg.input_value("#quickfuel-form [name=km]") == "153100"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_puhe_jatkaa_kirjoitettua_tekstia(browser, base):
    s, _ = avaa_plus(browser, base)
    try:
        s.page.fill("#ai-say-in", "eilen")
        s.page.evaluate("window.__puhe.tulos = '40 litraa 75 euroa'")
        s.page.click("[data-ai-mic]")
        viesti(s.page, "Tarkista teksti")
        assert s.page.input_value("#ai-say-in") == "eilen 40 litraa 75 euroa"
    finally:
        s.sulje()


@pytest.mark.parametrize("virhe,teksti", [
    ("not-allowed", "Mikrofonin käyttö on estetty"),
    ("service-not-allowed", "ei ole käytettävissä tässä selaimessa"),
    ("no-speech", "Puhetta ei kuulunut"),
    ("audio-capture", "Mikrofonia ei löytynyt"),
    ("network", "tarvitsee verkkoyhteyden"),
    ("language-not-supported", "ei tue tätä kieltä"),
    ("outo-virhe", "Puheentunnistus ei onnistunut"),
])
def test_virheet(browser, base, virhe, teksti):
    s, tila = avaa_plus(browser, base)
    try:
        s.page.evaluate("v => { window.__puhe.virhe = v; }", virhe)
        s.page.click("[data-ai-mic]")
        viesti(s.page, teksti)
        assert s.page.get_attribute("[data-ai-mic]", "aria-pressed") == "false"
        assert s.page.input_value("#ai-say-in") == ""
        assert tila["ai"] == []
    finally:
        s.sulje()


def test_hiljaisuus(browser, base):
    s, _ = avaa_plus(browser, base)
    try:
        s.page.evaluate("window.__puhe.tulos = ''")
        s.page.click("[data-ai-mic]")
        viesti(s.page, "Puhetta ei kuulunut")
    finally:
        s.sulje()


def test_toinen_painallus_lopettaa_ja_sulkeminen_keskeyttaa(browser, base):
    s, _ = avaa_plus(browser, base)
    try:
        pg = s.page
        pg.evaluate("window.__puhe.viive = 60000")
        pg.click("[data-ai-mic]")
        viesti(pg, "Kuunnellaan")
        pg.click("[data-ai-mic]")
        assert puhe(pg)["stopped"] == 1 and pg.get_attribute("[data-ai-mic]", "aria-pressed") == "false"
        pg.click("[data-ai-mic]")
        viesti(pg, "Kuunnellaan")
        pg.keyboard.press("Escape")
        pg.wait_for_function("() => !document.querySelector('.sheet-layer')")
        assert puhe(pg)["aborted"] == 1, "kuuntelu ei saa jäädä päälle ikkunan sulkeuduttua"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_lahetys_ja_taytä_kasin_keskeyttavat_kuuntelun(browser, base):
    s, tila = avaa_plus(browser, base)
    try:
        pg = s.page
        pg.evaluate("window.__puhe.viive = 60000")
        pg.click("[data-ai-mic]")
        viesti(pg, "Kuunnellaan")
        pg.click("[data-ai-manual]")
        assert puhe(pg)["aborted"] == 1
        assert pg.locator("#quickfuel-form").is_visible()
    finally:
        s.sulje()


def test_ilman_puheentunnistusta_ei_painiketta(browser, base):
    s, _ = avaa_plus(browser, base, puhe=EI_PUHETTA)
    try:
        assert s.page.locator("[data-ai-mic]").count() == 0
        assert "puheella" not in s.page.inner_text(".ai-lead")
        assert s.page.locator("#ai-say-in").is_visible() and s.page.locator("[data-ai-send]").is_visible()
    finally:
        s.sulje()


@pytest.mark.parametrize("kieli,lang,kuuntelee,valmis", [
    ("fi", "fi-FI", "Kuunnellaan", "Tarkista teksti"),
    ("en", "en-US", "Listening", "Check the text"),
    ("sv", "sv-SE", "Lyssnar", "Kontrollera texten"),
])
def test_kolme_kielta_ja_kapea_naytto(browser, base, kieli, lang, kuuntelee, valmis):
    s, _ = avaa_plus(browser, base, kieli=kieli, leveys=320, korkeus=640)
    try:
        pg = s.page
        r = pg.evaluate("""() => { const sh = document.querySelector('.sheet').getBoundingClientRect();
            return [...document.querySelectorAll('#ai-say-in, [data-ai-mic], [data-ai-send]')].map(e => { const b = e.getBoundingClientRect();
              return { w: b.width, h: b.height, ok: b.left >= sh.left - 0.5 && b.right <= sh.right + 0.5 }; }); }""")
        assert len(r) == 3 and all(x["ok"] and x["h"] >= 44 for x in r), r
        assert r[0]["w"] >= 120, "tekstikenttä jää käyttökelpoisen levyiseksi"
        assert pg.evaluate("document.querySelector('.sheet').scrollWidth <= document.querySelector('.sheet').clientWidth")
        pg.evaluate("window.__puhe.viive = 300")
        pg.click("[data-ai-mic]")
        viesti(pg, kuuntelee)
        viesti(pg, valmis)
        assert puhe(pg)["lang"] == lang
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


# ---- 1.22: iPhonen vikatilanteet ----------------------------------------------------------------------------

def test_jumissa_luovuttaa_ja_neuvoo_sanelun(browser, base):
    """Safari aloittaa kuuntelun mutta ei anna tulosta, virhettä eikä lopetusta: 6 sekunnin jälkeen kuuntelu keskeytetään."""
    s, tila = avaa_plus(browser, base)
    try:
        pg = s.page
        pg.evaluate("window.__puhe.tila = 'jumissa'")
        pg.click("[data-ai-mic]")
        viesti(pg, "paina mikrofonia uudelleen, kun olet valmis")
        pg.wait_for_function("() => document.querySelector('.ai-note').textContent.includes('ei vastaa tällä laitteella')", timeout=9000)
        assert "näppäimistön sanelua" in pg.inner_text(".ai-note")
        assert pg.get_attribute("[data-ai-mic]", "aria-pressed") == "false"
        assert puhe(pg)["aborted"] == 1
        assert tila["ai"] == []
        # Uusi yritys on mahdollinen.
        pg.evaluate("window.__puhe.tila = null; window.__puhe.viive = 50")
        pg.click("[data-ai-mic]")
        viesti(pg, "Tarkista teksti")
    finally:
        s.sulje()


def test_tulos_vasta_lopetettaessa(browser, base):
    """Safari antaa tuloksen vasta, kun käyttäjä lopettaa kuuntelun (toinen painallus)."""
    s, _ = avaa_plus(browser, base)
    try:
        pg = s.page
        pg.evaluate("window.__puhe.tila = 'stopilla'")
        pg.click("[data-ai-mic]")
        viesti(pg, "Kuunnellaan")
        pg.wait_for_timeout(300)
        pg.click("[data-ai-mic]")
        viesti(pg, "Tarkista teksti ja paina Lähetä")
        assert pg.input_value("#ai-say-in") == "Tankkasin 45,6 litraa dieseliä 84,77 euroa mittari 153100"
        assert pg.get_attribute("[data-ai-mic]", "aria-pressed") == "false"
    finally:
        s.sulje()


def test_selain_ei_paata_lopetusta(browser, base):
    """Toinen painallus lopettaa varmasti: jos selain ei päätä 2 sekunnissa, kuuntelu katkaistaan."""
    s, _ = avaa_plus(browser, base)
    try:
        pg = s.page
        pg.evaluate("window.__puhe.tila = 'ei_loppua'")
        pg.click("[data-ai-mic]")
        viesti(pg, "Kuunnellaan")
        pg.click("[data-ai-mic]")
        pg.wait_for_function("() => document.querySelector('[data-ai-mic]').getAttribute('aria-pressed') === 'false'", timeout=3500)
        viesti(pg, "Puhetta ei kuulunut")
        p = puhe(pg)
        assert p["stopped"] == 1 and p["aborted"] == 1
    finally:
        s.sulje()


def test_keskeytetty_kuuntelu_ei_sotke_myohempia_viesteja(browser, base):
    """Kun käyttäjä lähettää tekstin kesken jumiutuneen kuuntelun, aikaraja ei myöhemmin kirjoita viestin päälle."""
    s, tila = avaa_plus(browser, base)
    try:
        pg = s.page
        pg.evaluate("window.__puhe.tila = 'jumissa'")
        pg.click("[data-ai-mic]")
        viesti(pg, "Kuunnellaan")
        tila["ai_vastaus"] = {"kind": "other", "date": None, "quantity": None, "unit": None, "price_per_unit": None, "total": None,
                              "currency": None, "fuel": None, "mismatch": False, "odometer": None, "odometer_unit": None}
        pg.fill("#ai-say-in", "jotain")
        pg.click("[data-ai-send]")
        viesti(pg, "Tekstistä ei löytynyt tankkauksen tietoja")
        assert pg.get_attribute("[data-ai-mic]", "aria-pressed") == "false"
        pg.wait_for_timeout(6500)
        assert "Tekstistä ei löytynyt tankkauksen tietoja" in pg.inner_text(".ai-note")
    finally:
        s.sulje()
