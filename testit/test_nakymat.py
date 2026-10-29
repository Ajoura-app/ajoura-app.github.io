"""1. Näkymät avautuvat ilman virheitä (JavaScript-virheet, puuttuvat tiedostot, väärä uudelleenohjaus)."""
import pytest

import tiedot
from apu import avaa, nakyma

# Näkymä → osoite täydellä tallilla (tiedot.talli(): tst1 auto, tst2 sähköauto, tst3 vene).
NAKYMAT = {
    "home": "home", "menu": "menu", "me": "me", "help": "help", "settings": "settings",
    "feedback": "feedback", "tips": "tips", "reports": "reports", "newcar": "newcar",
    "vehicle": "vehicle/tst1", "vehicle-vene": "vehicle/tst3", "event": "event/tst1/e1",
    "edit": "edit/tst1/e1", "add": "add/tst1", "add-vene": "add/tst3", "report": "report/tst1",
    "report-raportit": "report/tst1/raportit", "caredit": "caredit/tst1", "owner": "owner/tst1",
    "notes": "notes/tst1", "fuel": "fuel/tst1", "fuel-sahko": "fuel/tst2",
    "fuel-ajoneuvo": "fuel/tst1/ajoneuvo",
}
TYHJA = ["home", "menu", "me", "help", "settings", "tips", "reports", "newcar", "fuel"]


def tarkista(s, osoite):
    sisalto = s.page.inner_text("#app-screen .screen-content").strip()
    assert sisalto, f"#{osoite}: näkymä on tyhjä"
    assert nakyma(s) == osoite.split("/")[0], f"#{osoite} ohjautui näkymään #{nakyma(s)}"
    assert not s.virheet, f"#{osoite}: " + "; ".join(s.virheet)


@pytest.mark.parametrize("kieli", ["fi", "en", "sv"])
@pytest.mark.parametrize("nimi", list(NAKYMAT))
def test_nakyma_tallilla(browser, base, nimi, kieli):
    osoite = NAKYMAT[nimi]
    s = avaa(browser, base, osoite, autot=tiedot.talli(), kieli=kieli)
    try:
        tarkista(s, osoite)
    finally:
        s.sulje()


@pytest.mark.parametrize("osoite", TYHJA)
def test_nakyma_tyhjalla_laitteella(browser, base, osoite):
    s = avaa(browser, base, osoite, autot=None)
    try:
        tarkista(s, osoite)
    finally:
        s.sulje()


def test_tietosuoja_ja_historia(browser, base):
    for polku in ("tietosuoja.html", "historia.html", "index.html"):
        s = avaa(browser, base, None, polku=polku, odota=False)
        try:
            s.page.wait_for_load_state("load")
            s.page.wait_for_timeout(300)
            assert not s.virheet, f"{polku}: " + "; ".join(s.virheet)
        finally:
            s.sulje()
