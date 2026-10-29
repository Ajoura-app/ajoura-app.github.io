"""5. Varmuuskopio: tallennus (lataus ja iPhonen jakovalikko), tiedoston muoto, palautus ja viallinen tiedosto.

Palautuksen pitää tuottaa täsmälleen samat tiedot (myös kuvat ja kuitit). Vanhan version varmuuskopio
(aineisto/varmuuskopio-0.37.json, tehty oikealla versiolla 0.37) pitää palautua muuttumattomana.
"""
import copy
import json
from pathlib import Path

import pytest

import tiedot
from apu import KELLO, TANAAN, avaa

AINEISTO = Path(__file__).parent / "aineisto"
VANHA = AINEISTO / "varmuuskopio-0.37.json"


def kanoninen(autot):
    """Vertailumuoto: autot id:n mukaan, luvut arvoina (85 == 85.0) ja tyhjä tankkauslista = ei tankkauksia
    (sovellus lisää latauksessa fuels: [] autoille, joilta se puuttuu)."""
    out = []
    for c in sorted(copy.deepcopy(autot), key=lambda c: c["id"]):
        if c.get("fuels") == []:
            del c["fuels"]
        out.append(c)
    return out


def tallenna_ladaten(s, tmp_path):
    """Tietokone: Tallenna varmuuskopio -painike lataa tiedoston."""
    s.page.goto(s.page.url.split("#")[0] + "#me")
    s.page.wait_for_selector("[data-backup]")
    with s.page.expect_download() as d:
        s.page.click("[data-backup]")
    polku = tmp_path / d.value.suggested_filename
    d.value.save_as(polku)
    return polku


def palauta(s, polku):
    s.page.goto(s.page.url.split("#")[0] + "#me")
    s.page.set_input_files("input[data-restore]", str(polku))
    s.page.wait_for_function("() => /palautettu|voitu lukea/.test(document.querySelector('#app-screen').innerText)")
    return s.page.inner_text("#app-screen")


def test_tallennus_ja_palautus_identtisena(browser, base, tmp_path):
    alku = tiedot.talli()
    s = avaa(browser, base, "me", autot=alku, mobiili=False, leveys=1280, korkeus=900, kello=KELLO)
    try:
        polku = tallenna_ladaten(s, tmp_path)
        assert polku.name == f"ajoura-varmuuskopio-{TANAAN}.json"
        d = json.loads(polku.read_text("utf-8"))
        assert d["app"] == "AJOURA" and d["version"] == 1 and set(d) == {"app", "version", "saved", "cars", "profile"}
        assert kanoninen(d["cars"]) == kanoninen(alku), "varmuuskopio ei sisällä samoja tietoja kuin laite"
        e1 = next(e for e in d["cars"][0]["events"] if e["id"] == "e1")
        assert e1["receipts"] and next(e for e in d["cars"][0]["events"] if e["id"] == "e4")["photos"]
        assert s.page.evaluate("localStorage.getItem('ajoura-backup-at')"), "varmuuskopion päivää ei tallennettu"
        assert "Viimeisin varmuuskopio" in s.page.inner_text("#app-screen")
        assert not s.virheet, s.virheet
    finally:
        s.sulje()

    t = avaa(browser, base, "me", autot=None, mobiili=False, leveys=1280, korkeus=900, kello=KELLO)
    try:
        teksti = palauta(t, polku)
        assert "3 uutta, 0 päivitetty" in teksti
        assert kanoninen(t.talli()["cars"]) == kanoninen(alku)
        t.page.reload()  # tiedot säilyvät uudelleenlatauksen jälkeen (IndexedDB)
        t.page.wait_for_timeout(500)
        assert kanoninen(t.page.evaluate("JSON.parse(localStorage.getItem('ajoura-app-v2')).cars")) == kanoninen(alku)
        assert not t.virheet, t.virheet
    finally:
        t.sulje()


@pytest.mark.parametrize("tulos", ["ok", "abort"])
def test_jakovalikko_iphonessa(browser, base, tulos):
    s = avaa(browser, base, "me", autot=tiedot.talli(), ios=True, jako=tulos, kello=KELLO)
    try:
        s.page.click("[data-backup]")
        s.page.wait_for_timeout(400)
        jaetut = s.jaetut()
        assert len(jaetut) == 1
        j = jaetut[0]
        assert j["type"] == "application/json" and j["active"], "jakovalikko ei saanut tiedostoa käyttäjän napautuksesta"
        assert kanoninen(json.loads(j["text"])["cars"]) == kanoninen(tiedot.talli())
        paiva = s.page.evaluate("localStorage.getItem('ajoura-backup-at')")
        if tulos == "ok":
            assert paiva and "tallennettu" in s.page.inner_text("#app-screen")
        else:
            assert not paiva, "peruutus merkitsi varmuuskopion otetuksi"
            assert "Varmuuskopiota ei tallennettu." in s.page.inner_text("#app-screen")
    finally:
        s.sulje()


def test_vanha_varmuuskopio_037(browser, base):
    vanha = json.loads(VANHA.read_text("utf-8"))
    s = avaa(browser, base, "me", autot=None, kello=KELLO)
    try:
        assert "3 uutta, 0 päivitetty" in palauta(s, VANHA)
        assert kanoninen(s.talli()["cars"]) == kanoninen(vanha["cars"]), "0.37:n varmuuskopio muuttui palautuksessa"
        # Sama tiedosto uudelleen: ei kaksoiskappaleita.
        assert "0 uutta, 3 päivitetty" in palauta(s, VANHA)
        assert kanoninen(s.talli()["cars"]) == kanoninen(vanha["cars"])
        # Vanhan version merkinnät näkyvät ja aukeavat.
        for c in vanha["cars"]:
            for e in c["events"]:
                s.page.goto(s.page.url.split("#")[0] + f"#event/{c['id']}/{e['id']}")
                s.page.wait_for_timeout(150)
                assert s.page.evaluate("location.hash") == f"#event/{c['id']}/{e['id']}"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_palautus_yhdistaa_eika_poista(browser, base):
    """Laitteessa oleva uudempi merkintä säilyy, kun vanha varmuuskopio palautetaan päälle."""
    vanha = json.loads(VANHA.read_text("utf-8"))
    laite = copy.deepcopy(vanha["cars"])
    laite[0]["events"].append(tiedot.merkinta("e99", "Renkaiden vaihto", "2026-10-20", 152390, items=["Kausivaihto"]))
    oma = tiedot.auto(id="tst9", plate="TST-909", name="Oma auto")
    s = avaa(browser, base, "me", autot=laite + [oma], kello=KELLO)
    try:
        assert "0 uutta, 3 päivitetty" in palauta(s, VANHA)
        autot = {c["id"]: c for c in s.talli()["cars"]}
        assert "tst9" in autot, "palautus poisti laitteen oman auton"
        assert "e99" in [e["id"] for e in autot["tst1"]["events"]], "palautus poisti laitteen uudemman merkinnän"
    finally:
        s.sulje()


def rikkinaiset():
    hyva = {"app": "AJOURA", "version": 1, "saved": "2026-10-29", "cars": tiedot.talli(),
            "profile": {"name": "", "months": 12, "km": 15000}}

    def muutos(f):
        d = copy.deepcopy(hyva)
        f(d)
        return json.dumps(d)

    return {
        "ei-json": "tämä ei ole varmuuskopio",
        "vaara-sovellus": muutos(lambda d: d.update(app="MUU")),
        "tuntematon-toimenpide": muutos(lambda d: d["cars"][0]["events"][0].update(items=["Tuntematon"])),
        "vaara-tekija": muutos(lambda d: d["cars"][0]["events"][0].update(by={"t": "hacker"})),
        "vaara-kuva": muutos(lambda d: d["cars"][0]["events"][0].update(photos=["javascript:alert(1)"])),
        "vaara-paiva": muutos(lambda d: d["cars"][1]["events"][0].update(date="29.10.2026")),
        "vaara-tankkaus": muutos(lambda d: d["cars"][0]["fuels"][0].update(qty=-5)),
    }


@pytest.mark.parametrize("nimi", list(rikkinaiset()))
def test_viallinen_tiedosto_hylataan_eika_muuta_tallia(browser, base, tmp_path, nimi):
    polku = tmp_path / "rikki.json"
    polku.write_text(rikkinaiset()[nimi], "utf-8")
    alku = [tiedot.auto(id="tst9", plate="TST-909", name="Oma auto")]
    s = avaa(browser, base, "me", autot=alku, kello=KELLO)
    try:
        assert "Tiedostoa ei voitu lukea" in palauta(s, polku)
        talli = s.talli()
        assert talli is None or kanoninen(talli["cars"]) == kanoninen(alku), "viallinen tiedosto muutti tallia"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
