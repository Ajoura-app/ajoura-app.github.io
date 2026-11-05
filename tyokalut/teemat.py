#!/usr/bin/env python3
"""Teemojen värit (v0.110). Aja repon juuressa: python3 tyokalut/teemat.py

1. Muuttaa app.css:n, roles.css:n ja ajoura.css:n kiinteät värit muotoon var(--c-xxxxxx,#xxxxxx). Alkuperäinen väri jää
   varaväriksi, joten Nykyinen-teema (oletus) näyttää täsmälleen samalta kuin ennen eikä riipu teemat.css:stä.
2. Laskee jokaiselle teemalle (TEEMAT alla) jokaisen värin vastineen ja kirjoittaa ne teemat.css:n
   GENEROITU-merkkien väliin. Teemat.css:n käsin kirjoitettu osa (merkkien jälkeen) käyttää --t-*-muuttujia.

Aja aina, kun app.css:ään tai roles.css:ään tulee uusi väri tai teeman perusvärejä muutetaan.
Testi testit/test_teemat.py huomaa, jos ajo on unohtunut. Ajo ei muuta mitään, jos kaikki on jo ajan tasalla.
Vain Pythonin vakiokirjasto, ei ulkoisia riippuvuuksia.
"""
import math
import re
import sys
from pathlib import Path

JUURI = Path(__file__).resolve().parent.parent
TOKENOITAVAT = ["app.css", "roles.css", "ajoura.css"]
# Näkymien piirto app.js:ssä käyttää muuttujia suoraan (esim. Vertailun viivavärit flCol): nimet kerätään myös sieltä.
KERATTAVAT = ["app.js"]
TEEMATIEDOSTO = JUURI / "teemat.css"
ALKU = "/* GENEROITU ALKU: tyokalut/teemat.py kirjoittaa tämän osan, älä muokkaa käsin. */"
LOPPU = "/* GENEROITU LOPPU */"

# Teemat: id, perusvärit. Arvot ovat suunnittelun lähtökohtia (CLAUDE_TOTEUTUSOHJE), kontrastit tarkistettu
# (testit/test_teemat.py). neutral_h/neutral_k: harmaasävyjen sävy (OKLCH-asteina) ja värikylläisyyden kerroin.
# deco: sivun yläosan koristeen tummin väri (teemat.css: var(--t-deco)); tekstien kontrasti lasketaan myös sitä vasten.
TEEMAT = {
    "auto": dict(bg="#f5f4f2", surface="#ffffff", text="#1b1e21", accent="#94592a", neutral_h=70, neutral_k=0.35, deco="#ebe8e4",
                 nav="#202326", hero="#202326", chart=["#2f6f9f", "#3f8a5a", "#94592a", "#7d8590"],
                 # Etusivun ajoneuvokortti ja alavalikko tummina (grafiitti): oma tumma värimuunnos niiden sisällä.
                 osat={".garage-row,.tab-bar.main-tabs": dict(bg="#17191c", surface="#23262a", text="#f4f2ef",
                                                             accent="#d79a62", neutral_h=70, neutral_k=0.35, dark=True)}),
    "eko": dict(bg="#f3f7f2", surface="#ffffff", text="#1b2c23", accent="#2c6848", neutral_h=150, neutral_k=0.75, deco="#e3efe2",
                nav="#ffffff", hero="#ffffff", chart=["#2f6db0", "#2c8a57", "#b8742a", "#7b8a80"]),
    "blue-track": dict(bg="#091d30", surface="#143650", text="#f4f8fb", accent="#43cada", neutral_h=245,
                       neutral_k=1.1, dark=True, nav="#0e2a42", hero="#143650",
                       chart=["#43cada", "#5fd39a", "#c7a2ff", "#9fb3c8"]),
    "premium": dict(bg="#f3ece6", surface="#fff9f5", text="#282422", accent="#9a583f", neutral_h=55, neutral_k=0.9, deco="#ebe1d8",
                    nav="#fff9f5", hero="#fff9f5", chart=["#4f6f8f", "#5d8a5e", "#9a583f", "#8f857d"]),
}
# Teeman muuttujat koskevat vain sovellusta: puhelinkehyksen sisäosaa ja sen ulkopuolelle avautuvia ikkunoita,
# sekä puhelimessa (selain tai asennettu sovellus) koko sivua. Tietokoneen esittelysivu pysyy ennallaan.
ALUE = ("html[data-theme={t}] .device-glass,html[data-theme={t}] .att-viewer,html[data-theme={t}] .intro-overlay,"
        "html[data-theme={t}].fullscreen,html[data-theme={t}].standalone")
# Säännöt, joiden värejä ei muuteta: puhelimen oma aloitusnäyttö esittelysivulla ja tumman tilan poikkeukset
# (tumma tila on vain Nykyisessä teemassa).
OHITA = re.compile(r"^\s*(html\.dark|:root|\.home-grid|\.home-app|\.ajoura-app|\.home-dock|\.home-clock|"
                   r"\.launch-hint|\.launcher|\.device-status|\.side-button|\.home-bar|\.camera\b)")
# Kaavioiden kululajit: oma paletti (ei sävynsiirtoa), jotta lajit erottuvat toisistaan myös vihreässä teemassa.
KAAVIO = {"2a78d6": 0, "1baf7a": 1, "6250d6": 2, "808b9a": 3}

HEX = re.compile(r"var\(--c-[0-9a-f]+,(?:#[0-9a-fA-F]+|white)\)|#[0-9a-fA-F]{3,8}\b|\bwhite\b")


# ---------------------------------------------------------------- värimuunnokset (sRGB <-> OKLab / OKLCH)
def hex_rgb(h):
    h = h.lstrip("#").lower()
    if len(h) in (3, 4):
        h = "".join(c * 2 for c in h)
    a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], a


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def delin(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def rgb_oklab(rgb):
    r, g, b = (lin(c) for c in rgb)
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)


def oklab_rgb(L, a, b):
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s]


def lch(h):
    rgb, a = hex_rgb(h)
    L, x, y = rgb_oklab(rgb)
    return L, math.hypot(x, y), math.degrees(math.atan2(y, x)) % 360, a


def lch_hex(L, C, H, a=1.0):
    """OKLCH -> #rrggbb(aa); värikylläisyyttä pienennetään, kunnes väri mahtuu sRGB:hen."""
    L = min(max(L, 0.0), 1.0)
    for _ in range(40):
        lin_rgb = oklab_rgb(L, C * math.cos(math.radians(H)), C * math.sin(math.radians(H)))
        if all(-1e-4 <= c <= 1 + 1e-4 for c in lin_rgb):
            break
        C *= 0.9
    rgb = [min(max(delin(min(max(c, 0), 1)), 0), 1) for c in lin_rgb]
    s = "#" + "".join(f"{round(c * 255):02x}" for c in rgb)
    if a < 0.999:
        s += f"{round(a * 255):02x}"
    return s


def luminanssi(h):
    rgb, _ = hex_rgb(h)
    r, g, b = (lin(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def kontrasti(a, b):
    x, y = sorted((luminanssi(a), luminanssi(b)), reverse=True)
    return (x + 0.05) / (y + 0.05)


# Alkuperäisen (Nykyinen) teeman ankkurit
O_SURF, O_BG, O_INK, O_ACC = lch("#ffffff"), lch("#f5f8fc"), lch("#17283d"), lch("#1464e8")


def interp(x, x0, x1, y0, y1):
    return y0 if x1 == x0 else y0 + (x - x0) * (y1 - y0) / (x1 - x0)


def lab(h):
    rgb, _ = hex_rgb(h)
    return list(rgb_oklab(rgb))


def lab_hex(p, a=1.0):
    return lch_hex(p[0], math.hypot(p[1], p[2]), math.degrees(math.atan2(p[2], p[1])) % 360, a)


def lerp(p, q, u):
    return [p[i] + (q[i] - p[i]) * u for i in range(3)]


def luminanssi_lab(p):
    return luminanssi(lab_hex(p))


def kohdista(p, Y, A=1.0):
    """Etsii vaaleuden L, jolla värin (sävy ja kylläisyys säilyvät) suhteellinen luminanssi on Y."""
    lo, hi = 0.0, 1.0
    for _ in range(32):
        mid = (lo + hi) / 2
        if luminanssi(lab_hex([mid, p[1], p[2]])) < Y:
            lo = mid
        else:
            hi = mid
    return lab_hex([(lo + hi) / 2, p[1], p[2]], A)


Y_OBG = None


def muunna(hexv, t):
    """Alkuperäinen väri -> teeman väri, kontrasti säilyttäen (ks. _muunna ja korjaus alla)."""
    global Y_OBG
    if Y_OBG is None:
        Y_OBG = luminanssi("#f5f8fc")
    tulos = _muunna(hexv, t)
    L, C, H, A = lch(hexv)
    if (A < 0.6 and L < 0.6) or L >= O_BG[0]:
        return tulos
    # Taustaa tummemmat värit (tekstit, reunat, painikkeet): sama kontrasti teeman heikointa pohjaa vasten kuin
    # alkuperäisessä taustaa (#f5f8fc) vasten. Vaaleassa teemassa heikoin pohja on tausta, tummassa korostettu pinta.
    # 4 %:n varmuusmarginaali: pyöristykset ja koristeet eivät pudota tekstiä alle alkuperäisen tason.
    R = min(21.0, 1.04 * (Y_OBG + 0.05) / (luminanssi(hexv[:7] if len(hexv) > 5 else hexv) + 0.05))
    if t.get("dark"):
        S = lab(t["surface"])
        Ya = luminanssi_lab([S[0] + 0.05, S[1], S[2]])
        Y = min(1.0, R * (Ya + 0.05) - 0.05)
    else:
        Y = max(0.0, (min(luminanssi(t["bg"]), luminanssi(t.get("deco", t["bg"]))) + 0.05) / R - 0.05)
    return kohdista(lab(tulos[:7]), Y, A)


def _muunna(hexv, t):
    """Alkuperäinen väri -> teeman väri. Värin asema alkuperäisen pinnan (valkoinen), taustan ja tekstin välillä
    säilyy, joten alkuperäisten värien kontrastit säilyvät (tummassa teemassa käänteisinä)."""
    L, C, H, A = lch(hexv)
    S, B, X, AC = lab(t["surface"]), lab(t["bg"]), lab(t["text"]), lab(t["accent"])
    acL, acC, acH, _ = lch(t["accent"])
    dark = t.get("dark", False)
    S2 = [S[0] + 0.05, S[1], S[2]]  # tummassa teemassa korostetut pinnat ovat pintaa vaaleampia

    def neutral(L):
        if L >= O_BG[0]:
            return lerp(B, S, (L - O_BG[0]) / (1.0 - O_BG[0]))
        u = (O_BG[0] - L) / (O_BG[0] - O_INK[0])  # 0 = tausta, 1 = teksti
        return lerp(S2 if dark else B, X, min(u, 1.12))

    def accent(L):
        if L >= O_ACC[0]:  # vaaleat sävyt pintaa kohti
            u = (L - O_ACC[0]) / (1.0 - O_ACC[0])
            return lerp(AC, S2 if dark and u < 0.999 else S, u)
        u = (O_ACC[0] - L) / (O_ACC[0] - O_INK[0])  # tummat sävyt tekstiä kohti
        return lerp(AC, X, min(u, 1.1))

    if A < 0.6 and L < 0.6:  # varjot: tummassa teemassa mustia, vaaleissa teeman sävyisiä
        if dark:
            return lch_hex(0.0, 0.0, 0.0, min(1.0, A * 1.6))
        return lch_hex(L, C * t["neutral_k"] * 0.8, t["neutral_h"], A)
    if 195 <= H <= 275 or C < 0.012:
        n = neutral(L)
        lisa = max(0.0, C - 0.01) * t["neutral_k"]  # alkuperäisen harmaan oma sävy teeman sävyyn
        n = [n[0], n[1] + lisa * math.cos(math.radians(t["neutral_h"])), n[2] + lisa * math.sin(math.radians(t["neutral_h"]))]
        w = 0.0 if C < 0.03 else min(1.0, (C - 0.03) / 0.07)  # 0 = harmaa, 1 = korostusväri
        if w <= 0:
            return lab_hex(n, A)
        a = accent(L)
        # korostusvärin kylläisyys alkuperäisen suhteessa, sävyero puolitettuna (syaani pysyy erillään sinisestä)
        aL, aC, aH = a[0], math.hypot(a[1], a[2]), math.degrees(math.atan2(a[2], a[1])) % 360
        Hd = (H - O_ACC[2] + 180) % 360 - 180
        u = min(1.0, C / O_ACC[1])
        aC = max(aC, acC * u)
        aH = (acH + Hd * 0.5) % 360
        a = [aL, aC * math.cos(math.radians(aH)), aC * math.sin(math.radians(aH))]
        return lab_hex(lerp(n, a, w), A)
    # Tilavärit (vihreä, oranssi, punainen, violetti): sävy säilyy; tummassa teemassa vaaleus käännetään
    if dark:
        return lch_hex(neutral(L)[0], C * (0.6 if L > 0.85 else 1.0), H, A)
    return hexv if len(hexv) > 4 else lch_hex(L, C, H, A)


# ---------------------------------------------------------------- CSS:n värit muuttujiksi
def nimi(h):
    h = h.lstrip("#").lower()
    if h == "white":
        return "ffffff"
    if len(h) in (3, 4):
        h = "".join(c * 2 for c in h)
    return h


def tokenoi(css):
    """Palauttaa (uusi css, käytetyt värinimet). Käsittelee vain sääntöjen esittelyjen arvot; kommentit,
    merkkijonot ja url(...)-osat säilyvät ennallaan."""
    out, nimet = [], set()
    i, n = 0, len(css)
    pino = []          # avoimet lohkot: (alkuteksti)
    alku = 0           # nykyisen esittely- tai valitsinpätkän alku
    while i < n:
        c = css[i]
        if css.startswith("/*", i):
            j = css.index("*/", i) + 2
            i = j
            continue
        if c in "\"'":
            j = i + 1
            while css[j] != c:
                j += 2 if css[j] == "\\" else 1
            i = j + 1
            continue
        if css.startswith("url(", i):
            i = css.index(")", i) + 1
            continue
        if c == "{":
            pino.append(re.sub(r"/\*.*?\*/", "", css[alku:i], flags=re.S).strip())
            alku = i + 1
        elif c == "}":
            if pino:
                pino.pop()
            alku = i + 1
        elif c == ";":
            alku = i + 1
        i += 1
    # Toinen kierros: sama läpikäynti, mutta nyt korvataan värit esittelyjen arvoissa.
    i, alku, pino, viim = 0, 0, [], 0
    while i < n:
        c = css[i]
        if css.startswith("/*", i):
            i = css.index("*/", i) + 2
            continue
        if c in "\"'":
            j = i + 1
            while css[j] != c:
                j += 2 if css[j] == "\\" else 1
            i = j + 1
            continue
        if c == "{":
            pino.append(re.sub(r"/\*.*?\*/", "", css[alku:i], flags=re.S).strip())
            alku = i + 1
            i += 1
            continue
        if c in ";}":
            # esittely css[alku:i], jos ollaan tyylisäännön sisällä
            if pino and not pino[-1].startswith("@") and not any(p.startswith("@font-face") for p in pino):
                valitsin = pino[-1]
                kehys = next((p for p in reversed(pino[:-1]) if p.startswith("@keyframes")), None)
                if kehys:
                    valitsin = kehys
                ohita = all(OHITA.match(v) for v in valitsin.split(",")) if valitsin else True
                decl = css[alku:i]
                if ":" in decl and not ohita:
                    out.append(css[viim:alku])
                    prop, arvo = decl.split(":", 1)
                    out.append(prop + ":" + _korvaa_arvo(arvo, nimet))
                    viim = i
            if c == "}" and pino:
                pino.pop()
            alku = i + 1
        i += 1
    out.append(css[viim:])
    return "".join(out), nimet


def _korvaa_arvo(arvo, nimet):
    osat = re.split(r"(url\([^)]*\))", arvo)
    for k in range(0, len(osat), 2):
        def r(m):
            s = m.group(0)
            if s.startswith("var("):
                nimet.add(re.match(r"var\(--c-([0-9a-f]+)", s).group(1))
                return s
            nm = nimi(s)
            nimet.add(nm)
            return f"var(--c-{nm},{s})"
        osat[k] = HEX.sub(r, osat[k])
    return "".join(osat)


# ---------------------------------------------------------------- teemat.css
def juurimuuttujat():
    """:root-muuttujat (ajoura.css, app.css), joissa on värejä: teema määrittelee ne uudelleen alueellaan."""
    tulos = {}
    for f in ("ajoura.css", "app.css"):
        css = (JUURI / f).read_text()
        for m in re.finditer(r":root\{([^}]*)\}", css):
            for d in m.group(1).split(";"):
                if d.strip().startswith("--") and ":" in d:
                    k, v = d.split(":", 1)
                    if re.search(r"#[0-9a-fA-F]{3,8}\b", v):
                        tulos[k.strip()] = v.strip()
    return tulos


def kaavio_vari(nm, t):
    return t["chart"][KAAVIO[nm]]


def teeman_lohko(tid, t, nimet, juuri):
    d = []
    # Semanttiset muuttujat käsin kirjoitettuja teemasääntöjä varten
    acc = t["accent"]
    on_acc = "#ffffff" if kontrasti(acc, "#ffffff") >= kontrasti(acc, t["bg"] if t.get("dark") else "#000000") else t["bg"]
    sem = {"--t-bg": t["bg"], "--t-surface": t["surface"], "--t-text": t["text"], "--t-accent": acc,
           "--t-on-accent": on_acc, "--t-muted": muunna("#4f5f72", t), "--t-border": muunna("#e0e9f2", t),
           "--t-soft": muunna("#edf4fd", t), "--t-nav": t["nav"], "--t-hero": t["hero"], "--t-deco": t.get("deco", t["bg"])}
    for i, v in enumerate(t["chart"]):
        sem[f"--chart-{i + 1}"] = v
    d += [f"{k}:{v}" for k, v in sem.items()]
    for k, v in sorted(juuri.items()):
        d.append(f"{k}:" + re.sub(r"#[0-9a-fA-F]{3,8}\b", lambda m: muunna(m.group(0), t), v))
    for nm in sorted(nimet):
        v = kaavio_vari(nm, t) if nm in KAAVIO else muunna("#" + nm, t)
        d.append(f"--c-{nm}:{v}")
    lohkot = [ALUE.format(t=tid) + "{" + ";".join(d) + "}"]
    # Osat: teeman sisällä oma (esim. tumma) värimuunnos tietyille osille, kuten Auto-teeman ajoneuvokortille.
    for valitsin, o in t.get("osat", {}).items():
        o = dict(o, chart=t["chart"])
        e = [f"--t-surface:{o['surface']}", f"--t-text:{o['text']}", f"--t-accent:{o['accent']}",
             f"--t-muted:{muunna('#4f5f72', o)}", f"--t-border:{muunna('#e0e9f2', o)}", f"--t-soft:{muunna('#edf4fd', o)}"]
        e += [f"{k}:" + re.sub(r"#[0-9a-fA-F]{3,8}\b", lambda m: muunna(m.group(0), o), v) for k, v in sorted(juuri.items())]
        e += [f"--c-{nm}:{kaavio_vari(nm, o) if nm in KAAVIO else muunna('#' + nm, o)}" for nm in sorted(nimet)]
        lohkot.append(",".join(f"html[data-theme={tid}] {v.strip()}" for v in valitsin.split(",")) + "{" + ";".join(e) + "}")
    return "\n".join(lohkot)


def generoi(nimet):
    juuri = juurimuuttujat()
    # Teemat vain näytöllä: tulosteessa (esim. raportti) alkuperäiset värit (muuttujien varavärit).
    rivit = [ALKU, "@media screen{"]
    for tid, t in TEEMAT.items():
        rivit.append(teeman_lohko(tid, t, nimet, juuri))
    rivit += ["}", LOPPU]
    return "\n".join(rivit)


def main(tarkista=False):
    kaikki, muutokset = set(), []
    for f in TOKENOITAVAT:
        p = JUURI / f
        vanha = p.read_text()
        uusi, nimet = tokenoi(vanha)
        kaikki |= nimet
        if uusi != vanha:
            muutokset.append(f)
            if not tarkista:
                p.write_text(uusi)
    for f in KERATTAVAT:
        kaikki |= set(re.findall(r"--c-\$\{|--c-([0-9a-f]{6,8})\b", (JUURI / f).read_text())) - {""}
        if "flCol=[" in (JUURI / f).read_text():  # flCol muodostaa nimet ajonaikaisesti: lisätään sen värit
            m = re.search(r"flCol=\[([^\]]*)\]", (JUURI / f).read_text())
            kaikki |= {nimi(h) for h in re.findall(r"#[0-9a-fA-F]{3,8}", m.group(1))}
    gen = generoi(kaikki)
    vanha = TEEMATIEDOSTO.read_text() if TEEMATIEDOSTO.exists() else ALKU + "\n" + LOPPU + "\n"
    if ALKU not in vanha or LOPPU not in vanha:
        sys.exit(f"{TEEMATIEDOSTO.name}: merkit {ALKU!r} ja {LOPPU!r} puuttuvat")
    a, loput = vanha.split(ALKU, 1)
    _, b = loput.split(LOPPU, 1)
    uusi = a + gen + b
    if uusi != vanha:
        muutokset.append(TEEMATIEDOSTO.name)
        if not tarkista:
            TEEMATIEDOSTO.write_text(uusi)
    return muutokset


if __name__ == "__main__":
    tarkista = "--tarkista" in sys.argv
    m = main(tarkista)
    if tarkista:
        print("Ajan tasalla." if not m else "Ei ajan tasalla: " + ", ".join(m))
        sys.exit(1 if m else 0)
    print("Päivitetty: " + ", ".join(m) if m else "Ei muutoksia.")
