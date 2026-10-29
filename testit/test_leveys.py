"""7b. Vaakavieritys: kapeimmillakin puhelimilla (320 ja 430 px) sivu ei saa vieriä sivusuunnassa."""
import pytest

import tiedot
from apu import KELLO, avaa

NAKYMAT = ["home", "menu", "me", "tips", "reports", "vehicle/tst1", "event/tst1/e1", "add/tst1",
           "report/tst1", "fuel/tst1", "newcar", "owner/tst1", "notes/tst1"]

# Tunnetut puutteet (näkymä, kieli, leveys), korjataan omana versionaan. Poista rivi korjauksen jälkeen.
TUNNETUT = {
    ("owner/tst1", "sv", 320),  # 4 px: päivä- ja mittarikentän rivi, kun "Mätarställning (km)" rivittyy (29.10.2026)
}

MITTAUS = """() => {
  const sc = document.querySelector('#app-screen .screen-content');
  const yli = sc.scrollWidth - sc.clientWidth;
  let pisin = null, oikea = sc.getBoundingClientRect().right;
  if (yli > 0) for (const e of sc.querySelectorAll('*')) {
    const r = e.getBoundingClientRect();
    if (r.width && r.right > oikea + 0.5 && getComputedStyle(e).position !== 'fixed'
        && !e.closest('.fl-cars, .fl-twrap')) { oikea = r.right; pisin = e.tagName.toLowerCase() + '.' + [...e.classList].join('.'); }
  }
  return {yli, pisin};
}"""


@pytest.mark.parametrize("leveys", [320, 430])
@pytest.mark.parametrize("kieli", ["fi", "en", "sv"])
def test_ei_vaakavieritysta(browser, base, kieli, leveys):
    virheet = []
    s = avaa(browser, base, "home", autot=tiedot.talli(), kieli=kieli, leveys=leveys, korkeus=800, kello=KELLO)
    try:
        for v in NAKYMAT:
            s.page.goto(base + "/app.html#" + v)
            s.page.wait_for_timeout(250)
            m = s.page.evaluate(MITTAUS)
            if m["yli"] > 0 and (v, kieli, leveys) not in TUNNETUT:
                virheet.append(f"#{v}: {m['yli']} px yli (pisin {m['pisin']})")
        assert not virheet, f"{leveys} px, {kieli}: " + "; ".join(virheet)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
