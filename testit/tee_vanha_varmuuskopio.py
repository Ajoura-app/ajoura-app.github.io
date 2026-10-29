"""Tekee testitiedoston aineisto/varmuuskopio-0.37.json ajamalla oikeaa versiota 0.37.

Käyttö (repon juuresta):
  git fetch --depth 1 origin backup/2026-10-28-v0.37
  git worktree add --detach ../v037 FETCH_HEAD
  python3 testit/tee_vanha_varmuuskopio.py ../v037

Talli esitäytetään keksityillä tiedoilla ilman 0.38:n kenttiä (by, created), sitten 0.37:n omalla
lomakkeella lisätään yksi merkintä ja varmuuskopio tallennetaan 0.37:n omalla painikkeella.
Tiedosto on siis aidosti 0.37:n tekemä. Ajetaan vain uudelleen, jos testitiedosto halutaan uusia.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import conftest  # noqa: E402  (asettaa selainpolun)
import tiedot  # noqa: E402
from apu import avaa  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

juuri = Path(sys.argv[1]).resolve()
ulos = Path(__file__).parent / "aineisto" / "varmuuskopio-0.37.json"
autot = tiedot.talli()
for c in autot:
    for e in c["events"]:
        e.pop("by", None)
        e.pop("created", None)

base, sammuta = conftest.palvelin(juuri)
with sync_playwright() as p:
    b = p.chromium.launch()
    s = avaa(b, base, "add/tst1", autot=autot, mobiili=False, leveys=1280, korkeus=900)
    pg = s.page
    pg.select_option("#event-form [name=type]", "Huolto")
    pg.fill("#event-form [name=date]", "2026-09-15")
    pg.fill("#event-form [name=km]", "152300")
    pg.fill("#event-form [name=cost]", "245")
    pg.check("#event-form [name=items][value=Moottoriöljy]")
    pg.fill("#event-form [name=note]", "Lisätty versiolla 0.37")
    pg.click("#event-form [type=submit]")
    pg.wait_for_timeout(500)
    pg.goto(base + "/app.html#me")
    pg.wait_for_timeout(500)
    with pg.expect_download() as d:
        pg.click("[data-backup]")
    ulos.parent.mkdir(exist_ok=True)
    d.value.save_as(ulos)
    assert not s.virheet, s.virheet
    s.sulje()
    b.close()
sammuta()
print("Tallennettu", ulos, ulos.stat().st_size, "tavua")
