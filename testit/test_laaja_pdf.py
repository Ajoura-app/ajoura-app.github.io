"""Laaja: PDF-tiedostot (Raportit, ajoneuvon raportti, merkintä, tankkauskirja) FI/EN/SV.

Tarkistaa, että tiedosto on ehjä (qpdf), A4-kokoinen (pdfinfo), sisältää ajoneuvon tunnuksen ja oikeat luvut
(pdftotext) ja ettei englannin- tai ruotsinkielisessä tiedostossa ole sovelluksen suomenkielisiä tekstejä.
"""
import re
import shutil
import subprocess

import pytest

import tiedot
from apu import KELLO, avaa

pytestmark = pytest.mark.laaja

PDF = {  # näkymä: (painike, tiedostonimen alku, tekstit jotka pitää löytyä)
    "reports": ("[data-rp-pdf]", "ajoura-kulut-", ["TST-101", "TST-202"]),
    "report/tst1": ("[data-vehicle-pdf]", "ajoura-TST101-", ["TST-101", "152 400", "815"]),
    "event/tst1/e1": ("[data-event-pdf]", "ajoura-TST101-merkinta-2025-03-14", ["TST-101", "128 900", "289", "Testikorjaamo Oy"]),
    "fuel/tst1": ("[data-fl-pdf]", "ajoura-TST101-tankkauskirja-", ["TST-101", "5,7", "222"]),
}
# Sovelluksen omia suomenkielisiä sanoja (ei testitallin käyttäjän tekstejä).
SUOMI = ["Yhteensä", "Kulut", "Huoltohistoria", "Merkinnät", "Päivämäärä", "Mittarilukema", "Tulostettu",
         "Jakso", "Kulutus", "Tankkaukset", "Polttoaine", "Sivu", "Huoltomerkintä", "Ajoneuvo"]


def aja(*k):
    return subprocess.run(k, capture_output=True, text=True)


@pytest.mark.skipif(not shutil.which("qpdf") or not shutil.which("pdftotext"), reason="qpdf tai pdftotext puuttuu")
@pytest.mark.parametrize("kieli", ["fi", "en", "sv"])
@pytest.mark.parametrize("nakyma", list(PDF))
def test_pdf(browser, base, tmp_path, nakyma, kieli):
    painike, nimi, loydyttava = PDF[nakyma]
    s = avaa(browser, base, nakyma, autot=tiedot.talli(), kieli=kieli, mobiili=False, leveys=1280, korkeus=900,
             kello=KELLO)
    try:
        with s.page.expect_download() as d:
            s.page.click(painike)
        assert d.value.suggested_filename.startswith(nimi) and d.value.suggested_filename.endswith(".pdf")
        polku = tmp_path / d.value.suggested_filename
        d.value.save_as(polku)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
    tarkistus = aja("qpdf", "--check", str(polku))
    assert tarkistus.returncode == 0, "PDF on rikki: " + tarkistus.stdout[-300:]
    assert re.search(r"Page size:\s+595\.\d* x 841\.\d*", aja("pdfinfo", str(polku)).stdout), "ei A4-kokoa"
    teksti = aja("pdftotext", "-layout", str(polku), "-").stdout
    for t in loydyttava:
        assert t in teksti, f"PDF:stä puuttuu {t!r}"
    if kieli == "fi":
        assert any(re.search(rf"\b{w}\b", teksti) for w in SUOMI), "suomenkielinen PDF ilman suomenkielisiä otsikoita"
    else:
        jaljella = [w for w in SUOMI if re.search(rf"\b{w}\b", teksti)]
        assert not jaljella, f"{kieli}-PDF:ssä suomenkielisiä tekstejä: {jaljella}"
