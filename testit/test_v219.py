"""2.19 (Niklas): Raporttien yhteenveto kertoo, mistä kokonaiskulut koostuvat: polttoaine- ja huoltokortissa
kirjausten määrä, kokonaiskuluissa muut kulut. Kolme ryhmää täsmää kokonaissummaan."""
import re

import pytest

import tiedot
from apu import KELLO, avaa

KORTIT = """() => Object.fromEntries([...document.querySelectorAll('.fv-card[data-fw]')].map(c => [c.dataset.fw, {
  arvo: Number((c.querySelector('.fv-val b')?.textContent || '').replace(/\\s/g, '')),
  maara: c.querySelector('.rp-count')?.innerText || '', muut: c.querySelector('.rp-other')?.innerText || ''}]))"""


def euro(t):
    return int(re.sub(r"\D", "", t.split("kulut")[-1]))


@pytest.mark.parametrize("teema", [None, "dark"])
def test_yhteenveto_koostuu_ryhmista(browser, base, teema):
    s = avaa(browser, base, "reports", autot=tiedot.talli(), kello=KELLO, teema=teema,
             extra={"ajoura-reports": '{"p":"year"}'})
    try:
        k = s.page.evaluate(KORTIT)
        # Vuosi 2026 keksityssä tallissa: tankkaukset 222,30 + 21,50 €, huollot ja korjaukset 412 + 199 + 150 €,
        # katsastus 54 € (muut). Yhteensä 1 058,80 € ≈ 1 059 €.
        assert k["fuel"]["arvo"] == 244 and k["fuel"]["maara"] == "5 kirjausta", k
        assert k["svc"]["arvo"] == 761 and k["svc"]["maara"] == "3 merkintää", k
        assert k["tot"]["arvo"] == 1059 and euro(k["tot"]["muut"]) == 54, k
        assert abs(k["fuel"]["arvo"] + k["svc"]["arvo"] + euro(k["tot"]["muut"]) - k["tot"]["arvo"]) <= 1, k
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_yksi_ajoneuvo_ja_yksikkomuoto(browser, base):
    s = avaa(browser, base, "reports", autot=tiedot.talli(), kello=KELLO,
             extra={"ajoura-reports": '{"p":"year","car":"tst2"}'})
    try:
        k = s.page.evaluate(KORTIT)
        assert k["fuel"]["maara"] == "2 kirjausta" and k["svc"]["maara"] == "1 merkintä", k
        assert euro(k["tot"]["muut"]) == 0, k
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_kortin_oma_jakso_laskee_maarat_omalta_jaksoltaan(browser, base):
    # Huoltokortilla oma jakso Koko historia: mukaan tulevat myös vuoden 2025 merkinnät (huolto ja renkaat).
    s = avaa(browser, base, "reports", autot=tiedot.talli(), kello=KELLO,
             extra={"ajoura-reports": '{"p":"year","kp":{"svc":{"p":"all"}}}'})
    try:
        k = s.page.evaluate(KORTIT)
        assert k["svc"]["maara"] == "4 merkintää" and k["fuel"]["maara"] == "5 kirjausta", k
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
