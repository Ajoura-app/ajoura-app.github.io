"""Apufunktiot: sovelluksen avaaminen testiselaimeen esitäytetyillä tiedoilla."""
import json

import tiedot

KELLO = "2026-10-29T10:00:00"  # kiinteä "tänään" testeille, joiden tulos riippuu päivästä
TANAAN = KELLO[:10]


def odota_nakyma(sivu, alku, aika=5000):
    """Odottaa, että osoite vaihtuu muotoon #alku… ja näkymä on piirtynyt."""
    sivu.page.wait_for_function("a => location.hash.startsWith('#' + a)", arg=alku, timeout=aika)
    sivu.page.wait_for_timeout(250)


def ilmoitus(sivu):
    """Näkymän onnistumis- tai virheilmoituksen teksti."""
    return " ".join(sivu.page.locator(".success-note, .error-note, .info-note, [role=status]").all_inner_texts())


def ilman(o, *avaimet):
    return {k: v for k, v in o.items() if k not in avaimet}


class Sivu:
    """Avattu sovellus: page (Playwright), virheet (lista) ja jaetut tiedostot (jakovalikko-tikku)."""

    def __init__(self, context, page, virheet):
        self.context, self.page, self.virheet = context, page, virheet

    def sulje(self):
        self.context.close()

    def jaetut(self):
        return self.page.evaluate("window.__shared||[]")

    def talli(self):
        """Sovelluksen localStorageen tallentama tila (dict)."""
        raw = self.page.evaluate("localStorage.getItem('ajoura-app-v2')")
        return json.loads(raw) if raw else None


def avaa(browser, base, nakyma="home", autot=None, kieli="fi", teema=None, leveys=390, korkeus=844,
         mobiili=True, asennettu=False, ios=False, jako=None, extra=None, kello=None, odota=True,
         polku="app.html", leike=False):
    """Avaa sovelluksen uudessa, tyhjässä selainkontekstissa.

    autot: lista ajoneuvoja (None = tyhjä laite, ei tallennettua tilaa).
    jako: None (ei jakovalikkoa), 'ok' tai 'abort' (navigator.share-tikku).
    extra: muut localStorage-avaimet {avain: arvo-merkkijono}.
    kello: ISO-aika, johon selaimen kello lukitaan (päivämäärästä riippuvat näkymät).
    """
    ua = None
    if ios:
        ua = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
              "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")
    ctx = browser.new_context(viewport={"width": leveys, "height": korkeus}, is_mobile=mobiili,
                              has_touch=mobiili, device_scale_factor=2 if mobiili else 1,
                              service_workers="block", reduced_motion="reduce", user_agent=ua,
                              timezone_id="Europe/Helsinki", locale="fi-FI",
                              accept_downloads=True)
    ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith(base) else r.abort())
    if kello:
        ctx.clock.set_fixed_time(kello)

    ls = {"ajoura-lang": kieli}
    if autot is not None:
        ls["ajoura-app-v2"] = tiedot.tila(autot)
    if teema:
        ls["ajoura-theme"] = teema
    ls.update(extra or {})
    ctx.add_init_script(f"""(() => {{
      if (!sessionStorage.getItem('__pre')) {{
        localStorage.clear();
        for (const [k, v] of Object.entries({json.dumps(ls)})) localStorage.setItem(k, v);
        sessionStorage.setItem('__pre', '1');
      }}
      sessionStorage.setItem('ajoura-intro', '1');
    }})();""")
    if asennettu:
        ctx.add_init_script("Object.defineProperty(navigator,'standalone',{get:()=>true});")
    if leike:  # ostajan linkki kopioidaan leikepöydälle: tallennetaan se muuttujaan window.__clip
        ctx.add_init_script("delete Navigator.prototype.share;"
                            "navigator.clipboard.writeText=async t=>{window.__clip=t;};")
    if jako:
        ctx.add_init_script(f"""(() => {{
      window.__shared = [];
      navigator.canShare = () => true;
      navigator.share = async (d) => {{
        const f = d.files && d.files[0];
        window.__shared.push({{name: f && f.name, type: f && f.type, size: f && f.size,
          text: f ? await f.text() : null, active: navigator.userActivation.isActive}});
        if ({json.dumps(jako)} === 'abort') throw new DOMException('Peruttu', 'AbortError');
      }};
    }})();""")

    page = ctx.new_page()
    page.set_default_navigation_timeout(30_000)  # allow local assets to load under parallel browser-test CPU load
    page.set_default_timeout(8_000)  # nopea epäonnistuminen, jos painiketta tai kenttää ei löydy
    virheet = []
    page.on("pageerror", lambda e: virheet.append(f"JS-virhe: {e}"))
    page.on("console", lambda m: m.type == "error" and not m.text.startswith("Failed to load resource")
            and virheet.append(f"Konsoli: {m.text}"))
    page.on("response", lambda r: r.url.startswith(base) and r.status >= 400
            and virheet.append(f"HTTP {r.status}: {r.url[len(base):]}"))
    page.on("dialog", lambda d: d.accept())
    page.goto(f"{base}/{polku}" + (f"#{nakyma}" if nakyma else ""))
    if odota:
        try:
            page.wait_for_selector("#app-screen .screen-content", state="attached", timeout=6_000)
        except Exception:
            ctx.close()
            raise AssertionError(f"#{nakyma}: näkymä ei piirtynyt. " + "; ".join(virheet)) from None
        page.wait_for_timeout(300)
    # Unit/UI suites block the network. The real on-device model is verified separately;
    # persistence and failure handling tests supply their own processing result.
    if polku == 'app.html':
        page.evaluate("if(window.AjouraCarPhoto)AjouraCarPhoto.process=async data=>data")
    return Sivu(ctx, page, virheet)


def nakyma(sivu):
    """Nykyinen näkymä osoitteesta (#vehicle/tst1 → 'vehicle')."""
    return sivu.page.evaluate("(location.hash.slice(1)||'').split('/')[0]")


def nykyinen_ajoneuvo(page):
    """Scope checks to the vehicle last opened by the user on the multi-vehicle home."""
    tunniste=page.evaluate('window.AjouraSecretary?.selected()')
    return page.locator('.vehicle-home-card[data-car=' + json.dumps(tunniste) + ']')


def avaa_ajoneuvovalitsin(page):
    """The list is always visible in 2.07; there is no picker to open."""
    assert page.locator('.vehicle-home-card').count() > 0


def valitse_ajoneuvo(page, tunniste):
    kortti=page.locator('.vehicle-home-card[data-car=' + json.dumps(tunniste) + ']')
    painike=kortti.locator('[data-vehicle-toggle]')
    if painike.get_attribute('aria-expanded')=='true':
        painike.click()
    painike.click()


def avaa_ajoneuvon_tiedot(page):
    kortti=nykyinen_ajoneuvo(page)
    painike=kortti.locator('[data-vehicle-toggle]')
    if painike.get_attribute('aria-expanded')!='true':painike.click()
    panel=kortti.locator('.secretary-vehicle-details')
    if panel.get_attribute('open') is None:panel.locator(':scope > summary').click()


def avaa_tehtavat(page):
    avaa_ajoneuvon_tiedot(page)
    panel=nykyinen_ajoneuvo(page).locator('.secretary-all-tasks')
    if panel.get_attribute('open') is None:panel.locator(':scope > summary').click()


def avaa_tehtavan_lisatiedot(page, task):
    if not task.is_visible():avaa_tehtavat(page)
    panel=task.locator('.task-details')
    if panel.get_attribute('open') is None:panel.locator(':scope > summary').click()


def avaa_kirjausvaihtoehdot(page):
    avaa_ajoneuvon_tiedot(page)
    panel=nykyinen_ajoneuvo(page).locator('.secretary-more')
    if panel.get_attribute('open') is None:panel.locator(':scope > summary').click()


def kirjaa_avustajasta(page, tapa):
    if tapa=='speech':page.locator('.assistant-widget [data-secretary-mode=speech]').click();return
    painike=nykyinen_ajoneuvo(page).locator('[data-secretary-mode=' + json.dumps(tapa) + ']')
    if not painike.is_visible():avaa_kirjausvaihtoehdot(page)
    painike.click()


def ikkuna_valmis(page):
    """Odottaa, että tankkausikkuna on siirtänyt kohdistuksen omaan kenttäänsä (seuraavassa ruudunpäivityksessä).
    Ilman tätä kuormitetussa ajossa kenttään kirjoitettu teksti voi päätyä hintakenttään, kun kohdistus siirtyy kesken
    kirjoituksen (ihmiskäyttäjälle ei tapahdu: kohdistus siirtyy ennen kuin ehtii kirjoittaa)."""
    page.wait_for_function("() => !!document.activeElement && !!document.activeElement.closest('.sheet')")


def avaa_ensimmainen_kortti(page):
    """Open the first vehicle image to arrange checks of expanded widgets."""
    button=page.locator('[data-vehicle-toggle]').first
    if button.count() and button.get_attribute('aria-expanded')!='true':button.click()
