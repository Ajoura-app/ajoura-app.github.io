"""0.114: tankkausikkunan laskettu kenttä ja hinta-arvio näkyvät desimaalipilkulla kuten muut kentät (ennen 1.889)."""
import tiedot
from apu import KELLO, avaa, ikkuna_valmis


def test_laskettu_kentta_pilkulla(browser, base):
    s = avaa(browser, base, "fuel/tst1", autot=tiedot.talli(), kello=KELLO)
    try:
        pg = s.page
        pg.click(".fl-add")
        ikkuna_valmis(pg)
        f = "#quickfuel-form"
        pg.fill(f + " [name=cost]", "77,96")
        pg.fill(f + " [name=qty]", "41,27")
        assert pg.input_value(f + " [name=ppu]") == "1,889"
        pg.keyboard.press("Escape")
        pg.click(".fl-add")
        ikkuna_valmis(pg)
        pg.fill(f + " [name=ppu]", "1,9")
        pg.fill(f + " [name=cost]", "95,5")
        assert pg.input_value(f + " [name=qty]") == "50,26"
        # Tallennettu arvo on sama kuin ennen (luku, ei teksti).
        pg.fill(f + " [name=km]", str(tiedot.talli()[0]["km"] + 500))
        pg.click(f + " [type=submit]")
        pg.wait_for_function("() => !document.querySelector('.sheet-layer')")
        uusi = max(s.talli()["cars"][0]["fuels"], key=lambda x: x["km"])
        assert isinstance(uusi["qty"], (int, float)) and abs(uusi["cost"] - 95.5) < 0.001
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
