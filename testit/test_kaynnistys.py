"""Käynnistysanimaatio (0.83): vaalea auto, 5–8 paperikuittia lentää auton takaa logoon ja häipyy,
iskulause "Matka jää muistiin!" (0.85, myös tervetulosivulla; EN/SV käännetty), ei vaakavieritystä, rauhallinen versio ilman kuitteja,
kun laitteessa on vähennetty liikettä. Animaatio ajetaan pysäytettynä ja kelataan tiettyihin hetkiin."""
import pytest

from apu import avaa

ISKULAUSEET = [("fi", "Matka jää muistiin!"), ("en", "Every journey remembered!"), ("sv", "Resan stannar i minnet!")]

KUITIT = """() => [...document.querySelectorAll('.intro-overlay .rc')].map(rc => {
  const p = rc.querySelector('.rc-p'), r = p.getBoundingClientRect();
  return {nakyva: getComputedStyle(rc.querySelector(':scope>i>i')).opacity, x: r.left, oikea: r.right,
          y: r.top + r.height / 2, kuva: !!p.querySelector('use'), nayttö: getComputedStyle(rc).display};
})"""


def avaa_intro(browser, base, leveys=390, kieli="fi", liike="no-preference"):
    ctx = browser.new_context(viewport={"width": leveys, "height": 760}, is_mobile=True, has_touch=True,
                              service_workers="block", reduced_motion=liike)
    ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith(base) else r.abort())
    ctx.add_init_script(f"localStorage.setItem('ajoura-lang','{kieli}');")
    page = ctx.new_page()
    virheet = []
    page.on("pageerror", lambda e: virheet.append(str(e)))
    page.goto(f"{base}/app.html?pwa=1")
    page.wait_for_selector(".intro-overlay .intro", timeout=5000)
    page.wait_for_selector(".intro-overlay .intro:not(.intro-wait)", timeout=5000)  # 0.86: alkaa vasta näkyvänä
    return ctx, page, virheet


def kelaa(page, ms):
    page.evaluate("t => document.getAnimations().forEach(a => { a.pause(); a.currentTime = t; })", ms)


@pytest.mark.parametrize("kieli,teksti", ISKULAUSEET)
def test_iskulause(browser, base, kieli, teksti):
    ctx, page, virheet = avaa_intro(browser, base, kieli=kieli)
    try:
        assert page.inner_text(".intro-overlay .intro-slogan").strip() == teksti
        kelaa(page, 3700)
        assert float(page.eval_on_selector(".intro-overlay .intro-slogan", "e => getComputedStyle(e).opacity")) > 0.99, \
            "iskulause ei ole näkyvissä animaation lopussa"
        assert not virheet, virheet
    finally:
        ctx.close()


def test_auto_vaalea(browser, base):
    ctx, page, _ = avaa_intro(browser, base)
    try:
        # Korin pääväri: car-render.js:n paint-gradientin keskikohta (offset .3)
        varit = page.eval_on_selector_all(".intro-overlay .intro-car linearGradient[id^=paint] stop[offset='.3']",
                                          "s => s.map(e => e.getAttribute('stop-color'))")
        def lum(h):
            v = int(h[1:7], 16)
            return (0.299 * (v >> 16 & 255) + 0.587 * (v >> 8 & 255) + 0.114 * (v & 255)) / 255
        hex_ = [v for v in varit if v and v.startswith("#") and len(v) >= 7]
        assert hex_ and min(lum(v) for v in hex_) > 0.75, f"auto ei ole vaalea: {hex_[:6]}"
    finally:
        ctx.close()


@pytest.mark.parametrize("leveys", [320, 390, 430])
def test_kuitit_lentavat_logoon(browser, base, leveys):
    ctx, page, virheet = avaa_intro(browser, base, leveys=leveys)
    try:
        kuitit = page.evaluate(KUITIT)
        assert 5 <= len(kuitit) <= 8, f"kuitteja {len(kuitit)}"
        assert all(k["kuva"] and k["nayttö"] == "block" for k in kuitit), "kuitin SVG-kuva puuttuu tai piilossa"
        # 0.84: kuitit hiukan pienemmiksi (24 → 21 px leveys), mittasuhde 26:38 säilyy
        koko = page.eval_on_selector(".intro-overlay .rc-p", "e => [parseFloat(getComputedStyle(e).width), parseFloat(getComputedStyle(e).height)]")
        assert koko[0] <= 21 and abs(koko[1] / koko[0] - 38 / 26) < 0.02, f"kuitin koko {koko}"
        kelaa(page, 0)
        assert all(float(k["nakyva"]) < 0.05 for k in page.evaluate(KUITIT)), "kuitit näkyvät ennen auton liikettä"
        nahty = set()
        for t in range(500, 3500, 150):
            kelaa(page, t)
            for i, k in enumerate(page.evaluate(KUITIT)):
                if float(k["nakyva"]) > 0.3:
                    nahty.add(i)
                    assert k["x"] > -6 and k["oikea"] < leveys + 6, f"kuitti {i + 1} karkaa ruudulta hetkellä {t} ms"
            leveampi = page.evaluate("document.documentElement.scrollWidth - innerWidth")
            assert leveampi <= 0, f"vaakavieritys {leveampi} px hetkellä {t} ms"
        assert len(nahty) == len(kuitit), "kaikki kuitit eivät tulleet näkyviin"
        # Lopussa kuitit ovat häipyneet logon kohdalle
        kelaa(page, 3450)
        logo = page.eval_on_selector(".intro-overlay .intro-logo", "e => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; }")
        for i, k in enumerate(page.evaluate(KUITIT)):
            assert float(k["nakyva"]) < 0.05, f"kuitti {i + 1} näkyy vielä lopussa"
            assert logo[0] - 10 <= k["x"] and k["oikea"] <= logo[1] + 10 and logo[2] - 10 <= k["y"] <= logo[3] + 10, \
                f"kuitti {i + 1} ei päättynyt logon kohdalle"
        assert not virheet, virheet
    finally:
        ctx.close()


def test_vahennetty_liike(browser, base):
    ctx, page, _ = avaa_intro(browser, base, liike="reduce")
    try:
        assert page.eval_on_selector(".intro-overlay .intro-receipts", "e => getComputedStyle(e).display") == "none"
        assert page.inner_text(".intro-overlay .intro-slogan").strip() == "Matka jää muistiin!"
        page.wait_for_selector(".intro-overlay", state="detached", timeout=3000)
    finally:
        ctx.close()


def test_sulkeutuu_itse(browser, base):
    """Animaatio ei jää ruudulle: peitto poistuu noin 4,4 s kuluttua tai heti napautuksella."""
    ctx, page, _ = avaa_intro(browser, base)
    try:
        page.wait_for_selector(".intro-overlay", state="detached", timeout=6000)
    finally:
        ctx.close()
    ctx, page, _ = avaa_intro(browser, base)
    try:
        page.click(".intro-overlay")
        page.wait_for_selector(".intro-overlay", state="detached", timeout=1500)
    finally:
        ctx.close()


@pytest.mark.parametrize("kieli,teksti", ISKULAUSEET)
def test_tervetulosivun_iskulause(browser, base, kieli, teksti):
    """0.85: tervetulosivulla sama iskulause kuin käynnistysanimaatiossa (ennen "huolehtii autostasi.")."""
    sivu = avaa(browser, base, nakyma="welcome", kieli=kieli)
    try:
        assert sivu.page.inner_text(".welcome h2 span").strip() == teksti
        assert not sivu.virheet, sivu.virheet
    finally:
        sivu.sulje()


AUTO = """() => { const c = document.querySelector('.intro-overlay .intro-car').getBoundingClientRect(),
  l = document.querySelector('.intro-overlay .intro-road').getBoundingClientRect(),
  s = getComputedStyle(document.querySelector('.intro-overlay .intro-car svg'));
  return {vasen: c.left - l.left, oikea: l.right - c.right, nakyva: +s.opacity}; }"""


@pytest.mark.parametrize("leveys", [320, 430])
def test_auto_lahtee_viivan_alusta(browser, base, leveys):
    """0.86: auto on alussa viivan vasemmassa päässä (ei viivan ulkopuolella eikä keskellä) ja ajaa
    rauhallisemmin (3,4 s), viivan loppuun."""
    ctx, page, _ = avaa_intro(browser, base, leveys=leveys)
    try:
        kelaa(page, 0)
        a = page.evaluate(AUTO)
        assert abs(a["vasen"]) <= 1, f"auto ei ole viivan alussa: {a}"
        kelaa(page, 400)
        a = page.evaluate(AUTO)
        assert a["nakyva"] > 0.99 and 0 <= a["vasen"] < leveys * 0.06, f"auto ei lähde rauhassa viivan alusta: {a}"
        kesto = page.eval_on_selector(".intro-overlay .intro-car", "e => parseFloat(getComputedStyle(e).animationDuration)")
        assert kesto >= 3.3, f"auton ajo {kesto} s"
        kelaa(page, 3800)
        assert abs(page.evaluate(AUTO)["oikea"]) <= 1, "auto ei päätynyt viivan loppuun"
    finally:
        ctx.close()


def test_odottaa_kunnes_nakyvissa(browser, base):
    """0.86: animaatio ei kulu taustalla hitaan käynnistyksen aikana: se on pysäytettynä,
    kunnes kuvat ovat valmiit ja näkymä on piirretty."""
    ctx = browser.new_context(viewport={"width": 390, "height": 760}, is_mobile=True, has_touch=True,
                              service_workers="block")
    ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith(base) else r.abort())
    # Hidas laite: kuvien valmistuminen kestää (decode 0,8 s)
    ctx.add_init_script("const d = HTMLImageElement.prototype.decode; HTMLImageElement.prototype.decode = function () "
                        "{ return new Promise(r => setTimeout(r, 800)).then(() => d.call(this)); };")
    page = ctx.new_page()
    try:
        page.goto(f"{base}/app.html?pwa=1", wait_until="commit")
        page.wait_for_selector(".intro-overlay .intro.intro-wait", timeout=5000)
        page.wait_for_timeout(300)
        tila = page.eval_on_selector(".intro-overlay .intro-car", "e => e.getAnimations().map(a => [a.playState, a.currentTime])")
        assert tila and all(t[0] == "paused" and t[1] == 0 for t in tila), f"animaatio kului odottaessa: {tila}"
        page.wait_for_selector(".intro-overlay .intro:not(.intro-wait)", timeout=5000)
    finally:
        ctx.close()
