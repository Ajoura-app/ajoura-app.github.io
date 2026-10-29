"""8. Manifesti (AJ-07, 0.48): ei suuntalukitusta eikä konseptidemo-tekstiä; asennettu sovellus pysyy samana sovelluksena."""
import json

from conftest import JUURI

MANIFESTI = JUURI / "manifest.webmanifest"


def lue():
    return json.loads(MANIFESTI.read_text(encoding="utf-8"))


def test_ei_suuntalukitusta():
    # Puhelimen oma kääntöasetus päättää; pystylukitus poistettiin 0.48:ssa.
    assert "orientation" not in lue()


def test_ei_konseptidemo_tekstia():
    m = lue()
    for avain in ("name", "short_name", "description"):
        teksti = m.get(avain, "")
        assert teksti, f"{avain} puuttuu"
        for kielletty in ("konsepti", "demo", "kuvitteell"):
            assert kielletty not in teksti.lower(), f"{avain}: {teksti!r}"


def test_tunniste_ja_aloitusosoite_ennallaan():
    # id ja start_url muuttuessaan puhelin pitäisi sovellusta uutena sovelluksena.
    m = lue()
    assert m["id"] == "./app.html?pwa=1"
    assert m["start_url"] == "./app.html?pwa=1"
    assert m["scope"] == "./"
    assert m["display"] == "standalone"


def test_kuvakkeet_ovat_olemassa():
    for k in lue()["icons"]:
        assert (JUURI / k["src"]).is_file(), k["src"]


def test_manifesti_on_offline_listalla():
    assert "'manifest.webmanifest'" in (JUURI / "sw.js").read_text(encoding="utf-8")
