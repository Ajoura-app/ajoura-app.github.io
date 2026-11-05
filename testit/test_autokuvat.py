"""Autokuvat omassa repossa (0.105): mallikuvat haetaan sivuston omasta kansiosta autokuvat/, ei ulkoiselta palvelimelta."""
import re
import struct

import pytest

import apu
import tiedot
from conftest import JUURI

KUVAT = JUURI / "autokuvat"
KOODI = ("car-images.js", "app.js", "index.html")


def kuvatiedostot():
    """Poimii car-images.js:n mallikuvien tiedostonimet ('merkki|malli|korityyppi|vuosi': tiedosto)."""
    teksti = (JUURI / "car-images.js").read_text(encoding="utf-8")
    return re.findall(r'"[^"]+\|[^"]+\|[^"]+\|\d+":\s*"([^"]+)"', teksti)


def webp_mitat(polku):
    """Lukee WebP-tiedoston leveyden ja korkeuden otsikosta (VP8, VP8L tai VP8X)."""
    d = polku.read_bytes()[:40]
    assert d[:4] == b"RIFF" and d[8:12] == b"WEBP", f"ei WebP-tiedosto: {polku.name}"
    tyyppi = d[12:16]
    if tyyppi == b"VP8 ":
        return struct.unpack("<HH", d[26:30])[0] & 0x3FFF, struct.unpack("<HH", d[26:30])[1] & 0x3FFF
    if tyyppi == b"VP8L":
        b = struct.unpack("<I", d[21:25])[0]
        return (b & 0x3FFF) + 1, ((b >> 14) & 0x3FFF) + 1
    if tyyppi == b"VP8X":
        return int.from_bytes(d[24:27], "little") + 1, int.from_bytes(d[27:30], "little") + 1
    raise AssertionError(f"tuntematon WebP-tyyppi {tyyppi!r}: {polku.name}")


def test_koodissa_ei_ulkoisia_kuvaosoitteita():
    # Kuvat eivät saa riippua kolmannen osapuolen palvelimesta (häviävät, eivät näy ilman verkkoa).
    for nimi in KOODI:
        teksti = (JUURI / nimi).read_text(encoding="utf-8")
        assert "cloudfront" not in teksti.lower(), f"{nimi}: viittaa ulkoiseen kuvapalvelimeen"
        assert not re.search(r'["\'`]https?://[^"\'`]*\.(png|webp|jpe?g)', teksti, re.I), f"{nimi}: ulkoinen kuvaosoite"


def test_kuvapolku_on_oma_kansio():
    teksti = (JUURI / "car-images.js").read_text(encoding="utf-8")
    assert "const base = 'autokuvat/';" in teksti


def test_kaikki_viitatut_kuvat_ovat_repossa():
    viitatut = set(kuvatiedostot())
    assert len(viitatut) >= 1000, f"mallikuvia vain {len(viitatut)}"
    for nimi in KOODI[1:]:
        viitatut |= set(re.findall(r"autokuvat/([\w.-]+\.webp)", (JUURI / nimi).read_text(encoding="utf-8")))
    puuttuvat = sorted(n for n in viitatut if not (KUVAT / n).is_file())
    assert not puuttuvat, f"puuttuu {len(puuttuvat)} kuvaa, esim. {puuttuvat[:3]}"


def test_kuvat_ovat_kelvollisia_webp_ja_sopivan_kokoisia():
    # Sovellus pienentää kuvat 840 px leveiksi, joten suurempi leveys vain turhaan kasvattaisi repoa.
    koko = 0
    for nimi in sorted(set(kuvatiedostot())):
        p = KUVAT / nimi
        assert nimi.endswith(".webp"), nimi
        l, k = webp_mitat(p)
        assert 400 <= l <= 840 and 200 <= k <= 700, f"{nimi}: {l}×{k}"
        koko += p.stat().st_size
    assert koko < 60_000_000, f"kuvat vievät {koko / 1e6:.0f} Mt, repon koko kasvaa liikaa"


def test_ei_turhia_kuvatiedostoja():
    # Kansiossa ei saa olla kuvia, joihin mikään koodi ei viittaa (turhaa painoa julkisessa repossa).
    viitatut = set(kuvatiedostot())
    for nimi in KOODI[1:]:
        viitatut |= set(re.findall(r"autokuvat/([\w.-]+\.webp)", (JUURI / nimi).read_text(encoding="utf-8")))
    turhat = sorted(p.name for p in KUVAT.iterdir() if p.name not in viitatut)
    assert not turhat, f"{len(turhat)} turhaa kuvaa, esim. {turhat[:3]}"


def test_kuva_latautuu_omalta_palvelimelta_ja_canvas_voi_lukea_sen(browser, base):
    # Värjäys lukee kuvan pikselit canvasista: ulkoinen kuva ilman CORS-lupaa kaataisi sen ("tainted canvas").
    s = apu.avaa(browser, base, "home", autot=[tiedot.auto()])
    try:
        tulos = s.page.evaluate("""async () => {
          const f = window.AjouraImages.files, k = Object.keys(f)[0];
          const [b, m, body, y] = k.split('|');
          const url = window.AjouraImages.get(b, m, body, y);
          const r = await fetch(url);
          const im = await new Promise((ok, fail) => { const i = new Image(); i.crossOrigin = 'anonymous';
            i.onload = () => ok(i); i.onerror = () => fail(new Error('kuva ei latautunut')); i.src = url; });
          const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8;
          const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, 8, 8); cx.getImageData(0, 0, 8, 8);
          return { url, status: r.status, tyyppi: r.headers.get('content-type'), w: im.naturalWidth };
        }""")
        assert tulos["url"].startswith("autokuvat/"), tulos
        assert tulos["status"] == 200 and "webp" in tulos["tyyppi"], tulos
        assert tulos["w"] > 0, tulos
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_mallikuva_piirtyy_sovelluksessa_omasta_kansiosta(browser, base):
    # Auto, jolle on mallikuva (Mercedes-Benz W124 sedan): kuvaelementti osoittaa omaan kansioon ja värjäys valmistuu.
    auto = tiedot.auto(name="Mercedes-Benz W124", year=1990, body="sedan", color="#2b4a6f")
    s = apu.avaa(browser, base, "home", autot=[auto])
    try:
        s.page.wait_for_selector('image.car-model-img[data-src^="autokuvat/"]', state="attached", timeout=6000)
        s.page.wait_for_selector('image.car-model-img[data-src^="autokuvat/"][data-done="1"]', state="attached",
                                 timeout=8000)
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tausta_ei_vuoda_koriin(browser, base):
    # 0.106: valkoisen kuvapohjan tausta poistetaan täyttämällä vaaleat pikselit kuvan reunasta alkaen. Jos auton
    # ääriviivassa on rako, täyttö valuu valkoiseen koriin ja korin sisään jää läpinäkyvä aukko (ML 2011 ja Q3 2011
    # versiossa 0.105). Mitataan jokaisesta kuvasta sovelluksen oman värjäyksen tuloksesta läpinäkyvät pikselit, joilla
    # on auton pikseli vasemmalla, oikealla, ylhäällä ja alhaalla (eli korin sisällä). Ehjissä kuvissa enintään 1,4 %
    # (avoauton ohjaamo); vuotaneissa 7–10 %.
    s = apu.avaa(browser, base, "home", autot=[tiedot.auto()])
    try:
        tulos = s.page.evaluate("""async () => {
          const M = window.AjouraModels, C = window.AjouraCar, keys = Object.keys(window.AjouraImages.files), out = [];
          const box = document.createElement('div'); document.body.appendChild(box);
          const mittaa = async src => {
            const im = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
            const w = im.naturalWidth, h = im.naturalHeight, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
            const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0); const d = cx.getImageData(0, 0, w, h).data, auto = i => d[i * 4 + 3] > 128;
            const L = new Int32Array(h).fill(-1), R = new Int32Array(h).fill(-1), T = new Int32Array(w).fill(-1), B = new Int32Array(w).fill(-1);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (auto(y * w + x)) { if (L[y] < 0) L[y] = x; R[y] = x; if (T[x] < 0) T[x] = y; B[x] = y; }
            let aukko = 0, ala = 0;
            for (let y = 0; y < h; y++) for (let x = L[y] + 1; L[y] >= 0 && x < R[y]; x++) {
              if (T[x] < 0 || y <= T[x] || y >= B[x]) continue;
              ala++; if (!auto(y * w + x)) aukko++;
            }
            return aukko / Math.max(1, ala);
          };
          for (let i = 0; i < keys.length; i += 40) {
            const osa = keys.slice(i, i + 40);
            box.innerHTML = osa.map(k => { const [b, m, body, y] = k.split('|');
              return `<div data-k="${k}">` + C.render(body, '#eef1f4', '', M.shape(b, m, body, Number(y))) + '</div>'; }).join('');
            C.hydrate(box);
            const alku = Date.now();
            while (Date.now() - alku < 30000 && ![...box.querySelectorAll('image.car-model-img')]
              .every(e => (e.getAttribute('href') || '').startsWith('data:'))) await new Promise(r => setTimeout(r, 50));
            for (const e of box.querySelectorAll('div[data-k]')) {
              const im = e.querySelector('image.car-model-img'), src = im && im.getAttribute('href');
              out.push([e.dataset.k, src && src.startsWith('data:') ? await mittaa(src) : null]);
            }
          }
          box.remove();
          return out;
        }""")
        assert len(tulos) >= 1000, f"mitattiin vain {len(tulos)} kuvaa"
        valmistumatta = [k for k, v in tulos if v is None]
        assert not valmistumatta, f"{len(valmistumatta)} kuvaa ei värjäytynyt, esim. {valmistumatta[:3]}"
        vuotavat = sorted(((v, k) for k, v in tulos if v > 0.02), reverse=True)
        assert not vuotavat, "tausta vuotaa koriin: " + ", ".join(f"{k} {v * 100:.1f} %" for v, k in vuotavat[:5])
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
