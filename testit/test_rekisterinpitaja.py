"""10. Tietosuojaseloste (0.118): rekisterinpitäjä on nimetty (Hannes ja Niklas yksityishenkilöinä), yhteyssähköposti
näkyy ja kohta on käännetty kolmelle kielelle. Vanha "lisätään ennen julkaisua" -paikkamerkki ja perustamaton
DRONEX-yritys eivät saa olla rekisterinpitäjäkohdassa."""
import pytest

from apu import avaa

SAHKOPOSTI = "info.ajoura@gmail.com"
# Kohdan avainlause kullakin kielellä (osoittaa, että kohta on käännetty eikä jäänyt suomeksi).
KOHTA = {
    "fi": "yksityishenkilöinä",
    "en": "as private individuals",
    "sv": "som privatpersoner",
}
PAIKKAMERKKI = ["lisätään tähän", "will be added here", "läggs till här"]


@pytest.mark.parametrize("kieli", ["fi", "en", "sv"])
def test_rekisterinpitaja_nimetty_ja_yhteystieto_nakyy(browser, base, kieli):
    s = avaa(browser, base, None, polku="tietosuoja.html", kieli=kieli, odota=False)
    try:
        s.page.wait_for_load_state("load")
        s.page.wait_for_timeout(300)
        # Rekisterinpitäjä-otsikon jälkeinen kappale
        kohta = s.page.evaluate(
            """() => {
                const h = [...document.querySelectorAll('h2')].find(e => /Rekisterinpit|Controller|Personuppgiftsansvarig/.test(e.textContent));
                return h && h.nextElementSibling ? h.nextElementSibling.textContent : '';
            }"""
        )
        assert kohta, f"{kieli}: rekisterinpitäjäkohtaa ei löytynyt"
        assert SAHKOPOSTI in kohta, f"{kieli}: yhteyssähköposti puuttuu"
        assert "Hannes" in kohta and "Niklas" in kohta, f"{kieli}: nimet puuttuvat"
        assert KOHTA[kieli] in kohta, f"{kieli}: kohta on kääntämättä: {kohta[:80]}"
        assert "DRONEX" not in kohta, f"{kieli}: yritystä ei ole vielä perustettu"
        for merkki in PAIKKAMERKKI:
            assert merkki not in kohta, f"{kieli}: vanha paikkamerkki '{merkki}'"
        assert not s.virheet, "; ".join(s.virheet)
    finally:
        s.sulje()
