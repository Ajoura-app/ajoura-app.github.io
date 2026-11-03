"""Testikäyttäjä (aineisto/testikayttaja.json): keksitty talli, jossa henkilöauto ja moottoripyörä 1.1.2024–3.11.2026.

Tarkistaa, että tiedosto on eheä (kilometrit ja päivät täsmäävät, kulutus järkevä), että se palautuu
laitteelle varmuuskopiona muuttumattomana ja että kaikki näkymät aukeavat sillä ilman virheitä.
Tiedoston tekee testit/tee_testikayttaja.py.
"""
import json
from datetime import date
from pathlib import Path

import pytest

from apu import avaa
from test_varmuuskopio import kanoninen, palauta

TIEDOSTO = Path(__file__).parent / "aineisto" / "testikayttaja.json"
ALKU, LOPPU = "2024-01-01", "2026-11-03"
KELLO = "2026-11-03T10:00:00"


@pytest.fixture(scope="module")
def data():
    return json.loads(TIEDOSTO.read_text("utf-8"))


def test_tiedoston_rakenne(data):
    assert data["app"] == "AJOURA" and data["version"] == 1 and "transfer" not in data
    auto, moto = data["cars"]
    assert auto.get("kind") in (None, "car") and moto["kind"] == "mc"
    assert auto["fuel"] == "Lataushybridi" and moto["fuel"] == "Bensiini"
    for c in data["cars"]:
        assert c["plate"].startswith("TST-"), "vain keksityt rekisteritunnukset"
        assert c["events"] and c["fuels"] and c["memos"]
        ajat = [e["date"] for e in c["events"]] + [f["date"] for f in c["fuels"]]
        assert min(ajat) >= ALKU and max(ajat) <= LOPPU, "kirjauksia aikavälin ulkopuolella"
        assert min(ajat) <= "2024-05-10" and max(ajat) >= "2026-10-01", "aineisto ei kata koko aikaväliä"


def test_kilometrit_ja_kulutus_jarkevia(data):
    for c in data["cars"]:
        tap = sorted(c["events"], key=lambda e: e["date"])
        assert [e["km"] for e in tap] == sorted(e["km"] for e in tap), f"{c['name']}: merkintöjen km ei kasva"
        assert tap[-1]["km"] <= c["km"]
        for laji, el in (("polttoaine", False), ("sähkö", True)):
            lista = sorted((f for f in c["fuels"] if bool(f.get("el")) == el), key=lambda f: (f["date"], f["km"]))
            if not lista:
                continue
            assert [f["km"] for f in lista] == sorted(f["km"] for f in lista), f"{c['name']}: {laji}kirjausten km ei kasva"
            assert len({f["id"] for f in lista}) == len(lista)
            assert all(f["full"] for f in lista if "full" in f)
            # Täydeltä täyteen -väli: yhteensä kulunut määrä jaettuna ajetulla matkalla.
            for a, b in zip(lista, lista[1:]):
                matka = b["km"] - a["km"]
                if b.get("skip") or matka < 30:
                    continue
                per100 = b["qty"] / matka * 100
                # Lataushybridin polttoaine kulkee sähkön rinnalla, joten sen kulutus on matala; pyörän tavallinen.
                raja = (4, 40) if el else (3.5, 8.0) if c["fuel"] == "Bensiini" else (1.0, 9.0)
                assert raja[0] <= per100 <= raja[1], f"{c['name']} {b['date']}: kulutus {per100:.1f}/100 km"
        for f in c["fuels"]:
            hinta_per = f["cost"] / f["qty"]
            assert 0.08 <= hinta_per <= 2.6, f"{c['name']} {f['date']}: hinta {hinta_per:.2f} €/yksikkö"
            date.fromisoformat(f["date"])
    moto = data["cars"][1]
    assert all(f["qty"] <= 18 for f in moto["fuels"]), "tankkaus yli säiliön (18 l)"
    assert all(f["qty"] <= 50 for f in data["cars"][0]["fuels"] if not f.get("el")), "tankkaus yli säiliön (50 l)"


def test_tiedoston_sisalto_esittelee_ominaisuudet(data):
    auto, moto = data["cars"]
    tyypit = {e["type"] for e in auto["events"]}
    assert {"Huolto", "Vuosihuolto", "Katsastus", "Renkaiden vaihto", "Autohoito", "Korjaus ja osan vaihto"} <= tyypit
    assert {"Käyttöönotto keväällä", "Talvisäilytykseen", "Huolto", "Katsastus"} <= {e["type"] for e in moto["events"]}
    assert any(e.get("receipts") for e in auto["events"]) and any(e.get("parts") for e in auto["events"])
    assert any(f.get("el") for f in auto["fuels"]) and any(not f.get("el") for f in auto["fuels"])
    assert any(f.get("cur") for f in auto["fuels"] + moto["fuels"]), "ei ulkomaan tankkausta"
    assert any(f.get("skip") for f in moto["fuels"]), "ei 'älä huomioi kulutuksessa' -tankkausta"
    assert {e["by"]["t"] for e in auto["events"] if e.get("by")} == {"self", "shop"}
    # Huoltomuistutus: viimeisestä huollosta on lähes 12 kk (huoltoväli ei ylity, mutta lähestyy)
    viimeisin = max(e["date"] for e in auto["events"] if e["type"] in ("Huolto", "Vuosihuolto", "Määräaikaishuolto"))
    assert "2025-10-01" <= viimeisin <= "2025-12-15"


def test_palautuu_laitteelle_muuttumattomana(browser, base, data):
    s = avaa(browser, base, "me", autot=None, mobiili=False, leveys=1280, korkeus=900, kello=KELLO)
    try:
        assert "2 uutta, 0 päivitetty" in palauta(s, TIEDOSTO)
        assert kanoninen(s.talli()["cars"]) == kanoninen(data["cars"]), "palautus muutti tietoja"
        assert "0 uutta, 2 päivitetty" in palauta(s, TIEDOSTO), "toinen palautus tuplasi tiedot"
        assert kanoninen(s.talli()["cars"]) == kanoninen(data["cars"])
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


NAKYMAT = ["home", "reports", "vehicle/tk-auto", "vehicle/tk-moto", "event/tk-auto/ae16", "event/tk-moto/me07",
           "fuel/tk-auto", "fuel/tk-auto/ajoneuvo", "fuel/tk-moto", "report/tk-auto", "report/tk-moto",
           "report/tk-auto/raportit", "notes/tk-auto", "tips"]


@pytest.mark.parametrize("kieli", ["fi", "en", "sv"])
@pytest.mark.parametrize("osoite", NAKYMAT)
def test_nakymat_testikayttajalla(browser, base, data, osoite, kieli):
    s = avaa(browser, base, osoite, autot=data["cars"], kieli=kieli, kello=KELLO)
    try:
        teksti = s.page.inner_text("#app-screen .screen-content")
        assert teksti.strip(), f"#{osoite}: tyhjä näkymä"
        for huono in ("NaN", "undefined", "Infinity", "[object"):
            assert huono not in teksti, f"#{osoite}: näkyvissä '{huono}'"
        assert not s.virheet, f"#{osoite}: " + "; ".join(s.virheet)
    finally:
        s.sulje()


def test_etusivu_nayttaa_molemmat_ja_muistutuksen(browser, base, data):
    s = avaa(browser, base, "home", autot=data["cars"], kello=KELLO)
    try:
        teksti = s.page.inner_text("#app-screen .screen-content")
        assert "Perheauto" in teksti and "Kesäpyörä" in teksti  # kutsumanimet
        assert "TST-301" in teksti and "TST-302" in teksti
        v = avaa(browser, base, "vehicle/tk-auto", autot=data["cars"], kello=KELLO)
        try:
            auto = v.page.inner_text("#app-screen .screen-content")
            assert "Seuraavaksi" in auto and "Katsastus" in auto
        finally:
            v.sulje()
    finally:
        s.sulje()
