"""Laaja: varmuuskopio edestakaisin edellisen julkaistun version kanssa.

Sama tiedosto palautetaan tyhjään talliin sekä vanhassa että uudessa versiossa, kummastakin tallennetaan
varmuuskopio, ja uuden tiedosto palautetaan vanhaan ja vanhan uuteen. Kaikkien neljän pitää olla identtisiä
syötteen kanssa. Näin uusi versio ei hävitä tietoja eikä tee tiedostoa, jota vanha versio ei osaa lukea
(puhelimessa voi olla vielä vanha versio välimuistissa).

Ajo: AJOURA_VERTAILU=../edellinen python3 -m pytest testit -m laaja
"""
import json

import pytest

import tiedot
from apu import KELLO, avaa
from test_varmuuskopio import VANHA, kanoninen, palauta, tallenna_ladaten

pytestmark = pytest.mark.laaja


def kierros(browser, osoite, tiedosto, tmp_path, nimi):
    """Palauttaa tiedoston tyhjään talliin ja tallentaa siitä varmuuskopion; palauttaa uuden tiedoston polun."""
    s = avaa(browser, osoite, "me", autot=None, mobiili=False, leveys=1280, korkeus=900, kello=KELLO)
    try:
        assert "palautettu" in palauta(s, tiedosto), f"{nimi}: palautus epäonnistui"
        kansio = tmp_path / nimi
        kansio.mkdir()
        polku = tallenna_ladaten(s, kansio)
        assert not s.virheet, f"{nimi}: {s.virheet}"
        return polku
    finally:
        s.sulje()


@pytest.mark.parametrize("aineisto", ["testitalli", "vanha-0.37"])
def test_edestakaisin(browser, base, vanha_base, tmp_path, aineisto):
    if aineisto == "vanha-0.37":
        alku = VANHA
    else:
        alku = tmp_path / "alku.json"
        alku.write_text(json.dumps({"app": "AJOURA", "version": 1, "saved": "2026-10-29T08:00:00.000Z",
                                    "cars": tiedot.talli(), "profile": {"name": "", "months": 12, "km": 15000}}), "utf-8")
    odotus = kanoninen(json.loads(alku.read_text("utf-8"))["cars"])
    uusi = kierros(browser, base, alku, tmp_path, "uusi")
    vanha = kierros(browser, vanha_base, alku, tmp_path, "vanha")
    uusi_vanhaan = kierros(browser, vanha_base, uusi, tmp_path, "uusi-vanhaan")
    vanha_uuteen = kierros(browser, base, vanha, tmp_path, "vanha-uuteen")
    for nimi, p in [("uusi", uusi), ("vanha", vanha), ("uusi → vanha", uusi_vanhaan), ("vanha → uusi", vanha_uuteen)]:
        assert kanoninen(json.loads(p.read_text("utf-8"))["cars"]) == odotus, f"{aineisto}: {nimi} muutti tietoja"
