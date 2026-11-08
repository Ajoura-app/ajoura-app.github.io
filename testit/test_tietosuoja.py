"""9. Tietosuojaseloste (AJ-22, 0.65): ei viittaa Apu-välilehteen, jota ei ole; ohjeena Valikko → Anna palautetta
kolmella kielellä."""
import pytest

from apu import avaa

OHJE = {"fi": "Valikko → Anna palautetta", "en": "Menu → Give feedback", "sv": "Meny → Ge respons"}
KIELETTY = ["Apu-välilehde", "Apu-välilehti", "Help tab", "Hjälp-flik", "fliken Hjälp"]


@pytest.mark.parametrize("kieli", ["fi", "en", "sv"])
def test_tietosuoja_ohjaa_valikon_palautteeseen(browser, base, kieli):
    s = avaa(browser, base, None, polku="tietosuoja.html", kieli=kieli, odota=False)
    try:
        s.page.wait_for_load_state("load")
        s.page.wait_for_timeout(300)
        teksti = s.page.inner_text("body")
        assert teksti.count(OHJE[kieli]) == 2, f"{kieli}: odotettiin kaksi ohjetta '{OHJE[kieli]}'"
        for k in KIELETTY:
            assert k not in teksti, f"{kieli}: vanhentunut viittaus '{k}'"
        assert not s.virheet, "; ".join(s.virheet)
    finally:
        s.sulje()


@pytest.mark.parametrize("kieli", ["fi", "en", "sv"])
def test_tietosuoja_vastaa_nykyista_sovellusta(browser, base, kieli):
    """0.115: seloste nimeää kaikki palvelut, joihin sovellus ottaa yhteyttä (Supabase, Anthropic, Google, GitHub Pages),
    ei mainitse poistunutta kuvapalvelua (CloudFront, poistui 0.105) ja kertoo valitusoikeuden."""
    s = avaa(browser, base, None, polku="tietosuoja.html", kieli=kieli, odota=False)
    try:
        s.page.wait_for_load_state("load")
        s.page.wait_for_timeout(300)
        teksti = s.page.inner_text("main")
        for nimi in ("Supabase", "Anthropic", "Google", "GitHub Pages", "tietosuoja.fi"):
            assert nimi in teksti, f"{kieli}: puuttuu {nimi}"
        assert "CloudFront" not in teksti
        # 0.116: kirjautuminen (Google) ja pilvitallennus kuvattu, tilin poisto ohjeistettu.
        assert {"fi": "Poista tili ja pilvitiedot", "en": "Delete account and cloud data", "sv": "Radera konto och molndata"}[kieli] in teksti
        assert {"fi": "Jaettu talli:", "en": "Shared garage:", "sv": "Delat garage:"}[kieli] in teksti  # 0.117
        for fi in ("pilveen", "tilisi", "Kirjautuminen on vapaaehtoista") if kieli != "fi" else ():
            assert fi not in teksti, f"{kieli}: kääntämättä '{fi}'"
    finally:
        s.sulje()


@pytest.mark.parametrize('kieli,automatic,shared,standard,exception', [
    ('fi','automaattisesti pilveen','jäsenen laitteelle jo kopioidut','oletuskäytännöksi','poikkeuksia'),
    ('en','automatically syncs','already copied to the member','by default','exceptions'),
    ('sv','automatiskt till molnet','redan kopierats till medlemmens','som standard','undantag'),
])
def test_tietosuoja_selittaa_pilven_ja_sailytyksen(browser,base,kieli,automatic,shared,standard,exception):
    """Readers must see automatic sync, shared access and the retention exceptions."""
    s=avaa(browser,base,None,polku='tietosuoja.html',kieli=kieli,leveys=320,odota=False)
    try:
        p=s.page;p.wait_for_load_state('load');p.wait_for_timeout(300)
        text=p.inner_text('main')
        for marker in (automatic,shared,standard,exception):assert marker in text,(kieli,marker)
        assert not any(marker in text for marker in ['vain omaan laitteeseesi','meillä ei ole sellaista','näkee vain oma tilisi','Vain silloin, kun itse päätät:'])
        assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not s.virheet,s.virheet
    finally:s.sulje()
