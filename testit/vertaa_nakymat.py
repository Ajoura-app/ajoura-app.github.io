"""Vertaa näkymien HTML:ää kahden version välillä samoilla tiedoilla (laaja sarja, ajetaan käsin).

Käyttö: python3 testit/vertaa_nakymat.py VANHA_KANSIO [UUSI_KANSIO] [--kieli fi]
Tulostaa näkymät, joiden sisältö muuttui, ja erot. Erot ovat odotettuja niissä näkymissä, joita versio muutti;
muissa näkymissä ero on todennäköisesti tahaton. Versionumerot ja välimuistin numerot jätetään pois.
Asennetun iPhone-sovelluksen tila, jotta selaimen tietokortti ei näy kaikilla sivuilla.
"""
import difflib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import conftest  # noqa: E402
import tiedot  # noqa: E402
from apu import KELLO, avaa  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402
from test_nakymat import NAKYMAT  # noqa: E402

SIIVOUS = [(re.compile(r"ak-\d+"), "ak-N"), (re.compile(r"ajoura-pwa-\d+"), "ajoura-pwa-N"),
           (re.compile(r"\b0\.\d\d(?= \(test| /|\b)"), "0.xx"), (re.compile(r' opacity="0"'), ""),
           # Ajoneuvokuvan värjäys valmistuu eri aikaan: verrataan vain, mikä kuva on (data-src).
           (re.compile(r'<image class="car-model-img"[^>]*?(data-src="[^"]*")[^>]*>'), r'<image class="car-model-img" \1>'),
           # SVG-piirrosten juoksevat tunnisteet (vpv1, paint3) riippuvat piirtojärjestyksestä.
           (re.compile(r'(id="|url\(#|href="#)([A-Za-z_-]+?)\d+(?=[")])'), r"\1\2N")]


def html(b, osoite, kieli):
    out = {}
    for nimi, v in NAKYMAT.items():
        s = avaa(b, osoite, v, autot=tiedot.talli(), kieli=kieli, kello=KELLO, asennettu=True, ios=True)
        h = s.page.inner_html("#app-screen .screen-content")
        s.sulje()
        for r, k in SIIVOUS:
            h = r.sub(k, h)
        out[nimi] = h.replace("<", "\n<").splitlines()
    return out


def main():
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    kieli = sys.argv[sys.argv.index("--kieli") + 1] if "--kieli" in sys.argv else "fi"
    vanha, uusi = Path(a[0]).resolve(), Path(a[1] if len(a) > 1 else conftest.JUURI).resolve()
    ov, sv = conftest.palvelin(vanha)
    ou, su = conftest.palvelin(uusi)
    with sync_playwright() as p:
        b = p.chromium.launch()
        hv, hu = html(b, ov, kieli), html(b, ou, kieli)
        b.close()
    sv(), su()
    muuttuneet = [n for n in NAKYMAT if hv[n] != hu[n]]
    print(f"Vertailu {vanha.name} → {uusi.name} ({kieli}): {len(muuttuneet)}/{len(NAKYMAT)} näkymää muuttui")
    for n in muuttuneet:
        print(f"\n===== {n} =====")
        print("\n".join(difflib.unified_diff(hv[n], hu[n], "vanha", "uusi", n=1, lineterm="")))


if __name__ == "__main__":
    main()
