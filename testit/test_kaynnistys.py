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
    return ctx, page, virheet


def kelaa(page, ms):
    page.evaluate("t => document.getAnimations().forEach(a => { a.pause(); a.currentTime = t; })", ms)


@pytest.mark.parametrize("kieli,teksti", ISKULAUSEET)
def test_iskulause(browser, base, kieli, teksti):
    ctx, page, virheet = avaa_intro(browser, base, kieli=kieli)
    try:
        assert page.inner_text(".intro-overlay .intro-slogan").strip() == teksti
        kelaa(page, 3600)
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
