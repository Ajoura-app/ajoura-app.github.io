"""7a. Kääntämättömät tekstit: sama näkymä suomeksi ja englanniksi/ruotsiksi; tekstit, jotka ovat samat
molemmilla kielillä ja sisältävät sanoja, ovat todennäköisesti kääntämättä (uusi teksti puuttuu i18n-tiedostosta).

Sallitut (POIKKEUKSET) ovat sanoja, jotka ovat oikeasti samat kaikilla kielillä. Älä lisää listaan tekstiä vain
siksi, että testi menisi läpi: lisää käännös i18n.js:ään ja i18n-sv.js:ään.
"""
import re

import pytest

import tiedot
from apu import KELLO, avaa

POIKKEUKSET = {
    "kWh", "/kWh", "HVO100", "Latvia", "SEK", "Excel / CSV", "Android (Chrome)", "iCloud Drive", "Google Drive",
    "ajoura-app.github.io/app.html", "ajoura-app.github.io", "AJOURA", "AJOURA by DRONEX", "App", "PDF", "CSV",
    "OK", "Diesel", "Beige", "Coupé", "Sedan", "Km",
}
# Tunnetut puutteet, jotka korjataan omana versionaan. Poista rivi, kun käännös on lisätty.
TUNNETUT = {
    "Selaa merkintöjä",  # merkintäsivun selausnappien aria-label (ruudunlukija), löydetty 29.10.2026
}
TUNNUS = re.compile(r"^AJ-[A-Z0-9-]+$")  # raportin tunniste, esim. AJ-TST101-20261029
POIKKEUKSET_SV = {"Summa"}
# Yksiköt ja merkit, jotka jäävät ennalleen kaikilla kielillä (poistetaan ennen vertailua).
YKSIKOT = re.compile(r"(l/100 ?km|kWh/100 ?km|€/100 ?km|€/km|€/h|€/l|€/kWh|l/h|km|kWh|h|l|kk|vm|€|%)(?![A-Za-zÅÄÖåäöÉé])")

# Näkymä ja toimenpiteet ennen tekstien keruuta (napautukset).
NAKYMAT = {
    "home": [], "menu": [], "me": [], "help": [], "settings": [], "tips": [], "feedback": [], "newcar": [],
    "reports": ["[data-rp-more]"], "reports-cars": ["[data-rp-tab=cars]"], "vehicle/tst1": [],
    "vehicle/tst3": [], "event/tst1/e1": [], "add/tst1": [], "edit/tst1/e1": [], "report/tst1": [],
    "notes/tst1": [], "fuel/tst1": [], "fuel/tst2": [], "fuel-vertailu": ["[data-fl-tab=cmp]"],
    "owner/tst1": [], "caredit/tst1": [], "tankkausikkuna": [".fl-add"], "asennusohje": [".install-button"],
}
OSOITE = {"reports-cars": "reports", "fuel-vertailu": "fuel/tst1", "tankkausikkuna": "fuel/tst1",
          "asennusohje": "home"}

KERUU = """() => {
  const out = new Set(), add = t => { t = (t || '').replace(/\\s+/g, ' ').trim(); if (t) out.add(t); };
  const roots = ['#app-screen', '.sheet-layer', '#install-dialog'].map(s => document.querySelector(s)).filter(Boolean);
  for (const r of roots) {
    if (r.id === 'install-dialog' && !r.open) continue;
    const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) if (!n.parentElement.closest('[translate=no], script, style')) add(n.textContent);
    r.querySelectorAll('[aria-label], [placeholder], [title]').forEach(e => {
      if (!e.closest('[translate=no]')) for (const a of ['aria-label', 'placeholder', 'title']) add(e.getAttribute(a));
    });
  }
  return [...out];
}"""


def kayttajan_tekstit():
    """Testitallin omat tekstit (nimet, tunnukset, lisätiedot): niitä ei käännetä."""
    out = set()

    def k(v):
        if isinstance(v, dict):
            for x in v.values():
                k(x)
        elif isinstance(v, list):
            for x in v:
                k(x)
        elif isinstance(v, str) and not v.startswith("data:"):
            out.add(v)
    for c in tiedot.talli():
        for avain in ("name", "nick", "plate"):
            k(c.get(avain))
        for e in c["events"]:
            k(e.get("note"))
            k(e.get("by"))
            k(e.get("parts"))
        k(c.get("memos"))
    return out


_VALMIIT = {}


def tekstit(browser, base, nimi, kieli):
    if (nimi, kieli) not in _VALMIIT:
        _VALMIIT[nimi, kieli] = _kerää(browser, base, nimi, kieli)
    return _VALMIIT[nimi, kieli]


def _kerää(browser, base, nimi, kieli):
    s = avaa(browser, base, OSOITE.get(nimi, nimi), autot=tiedot.talli(), kieli=kieli, kello=KELLO)
    try:
        for valitsin in NAKYMAT[nimi]:
            s.page.click(valitsin)
            s.page.wait_for_timeout(300)
        assert not s.virheet, s.virheet
        return set(s.page.evaluate(KERUU))
    finally:
        s.sulje()


def kaannettava(t, oma):
    if t in oma or any(o and o in t for o in oma if len(o) > 3):
        return False
    jaljella = YKSIKOT.sub("", t)
    return bool(re.search(r"[A-Za-zÅÄÖåäöÉé]{2,}", jaljella))


@pytest.mark.parametrize("kieli", ["en", "sv"])
@pytest.mark.parametrize("nimi", list(NAKYMAT))
def test_ei_kaantamattomia_tekstejä(browser, base, nimi, kieli):
    fi = tekstit(browser, base, nimi, "fi")
    muu = tekstit(browser, base, nimi, kieli)
    sallitut = POIKKEUKSET | (POIKKEUKSET_SV if kieli == "sv" else set())
    oma = kayttajan_tekstit()
    jaljella = sorted(t for t in fi & muu if t not in sallitut | TUNNETUT and not TUNNUS.match(t)
                     and kaannettava(t, oma))
    assert not jaljella, f"{nimi} ({kieli}): kääntämättä {jaljella}"
