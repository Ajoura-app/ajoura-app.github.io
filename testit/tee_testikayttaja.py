"""Tekee testitiedoston aineisto/testikayttaja.json: keksitty testikäyttäjä, jolla on henkilöauto ja moottoripyörä.

Käyttö (repon juuresta):
  python3 testit/tee_testikayttaja.py

Tiedosto on tavallinen AJOURAn varmuuskopio (sama muoto kuin Valikon Tallenna varmuuskopio), joten se
palautetaan Valikko → Palauta varmuuskopio -toiminnolla. Kaikki tiedot ovat keksittyjä (ei oikeita
rekisteritunnuksia, nimiä, puhelinnumeroita tai kuitteja): repo on julkinen.

Aineisto kattaa ajan 1.1.2024–3.11.2026. Luvut lasketaan ajosimulaatiosta, joten kilometrit, tankkaukset ja
lataukset täsmäävät keskenään (tankkausmäärä = edellisen täyden tankkauksen jälkeen kulunut määrä).
Satunnaisluvut on lukittu (siemen), joten sama ajo tuottaa aina saman tiedoston. Tallennettujen tietojen
muotoon ei lisätä mitään uutta: vain kentät, jotka app.js:n validCar ja validFill jo hyväksyvät.
"""
import base64
import io
import json
import math
import random
from datetime import date, timedelta
from pathlib import Path

from PIL import Image, ImageDraw

ALKU = date(2024, 1, 1)
LOPPU = date(2026, 11, 3)
ULOS = Path(__file__).parent / "aineisto" / "testikayttaja.json"
rnd = random.Random(20260103)


def paivat():
    d = ALKU
    while d <= LOPPU:
        yield d
        d += timedelta(days=1)


def kuitti(rivit, vari=(250, 250, 244)):
    """Pieni keksitty kuittikuva (JPEG data-osoitteena)."""
    im = Image.new("RGB", (240, 330), vari)
    dr = ImageDraw.Draw(im)
    y = 12
    for r in rivit:
        dr.text((14, y), r, fill=(40, 40, 40))
        y += 16
    b = io.BytesIO()
    im.save(b, "JPEG", quality=62)
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()


def stamp(pvm, tunti=12):
    return f"{pvm}T{tunti:02d}:{rnd.randint(0, 59):02d}:00.000Z"


def vuoden_ajat(a, b):
    """Joukko päiviä (a, b ovat date-arvoja, molemmat mukana)."""
    return {a + timedelta(days=i) for i in range((b - a).days + 1)}


# ---------------------------------------------------------------- Henkilöauto (lataushybridi)
AUTO_LOMAT = vuoden_ajat(date(2024, 7, 6), date(2024, 7, 21)) | vuoden_ajat(date(2025, 7, 5), date(2025, 7, 20)) \
    | vuoden_ajat(date(2026, 7, 4), date(2026, 7, 19))
AUTO_RETKET = {date(2024, 7, 6): 430, date(2024, 7, 21): 430, date(2025, 7, 5): 520, date(2025, 7, 20): 520,
               date(2026, 7, 4): 390, date(2026, 7, 19): 390, date(2024, 12, 21): 300, date(2025, 12, 20): 300,
               date(2025, 2, 22): 260, date(2026, 2, 21): 260}
VUODEN_HINTA = {2024: 1.80, 2025: 1.74, 2026: 1.88}
SAHKO_HINTA = {2024: 0.145, 2025: 0.158, 2026: 0.152}


def auto_sim():
    odo = 41230
    paivakirja = {}
    pvt, sahko_kwh, bensa_l, kmt = {}, 0.0, 0.0, 0
    for d in paivat():
        wd, m, v = d.weekday(), d.month, d.year
        if d in AUTO_RETKET:
            km = AUTO_RETKET[d]
        elif d in AUTO_LOMAT:
            km = rnd.randint(10, 60) if rnd.random() < 0.8 else 0
        elif wd < 5:
            km = 0 if (d.month == 12 and d.day in (24, 25, 26)) else max(0, round(rnd.gauss(30, 5)))
        elif wd == 5:
            km = rnd.randint(8, 45) if rnd.random() < 0.7 else 0
        else:
            km = rnd.randint(60, 190) if rnd.random() < 0.4 else (rnd.randint(8, 30) if rnd.random() < 0.5 else 0)
        # sähköllä ajettavat kilometrit (talvella lyhyempi kantama)
        kantama = {12: 24, 1: 22, 2: 24, 3: 34, 11: 34}.get(m, 52)
        sk = min(km, kantama)
        bk = km - sk
        kul = {2024: 7.4, 2025: 7.0, 2026: 6.7}[v] + (0.7 if m in (12, 1, 2) else 0.0)
        kwh100 = (27.5 if m in (12, 1, 2) else 22.5 if m in (3, 11) else 19.5) * (1 + rnd.uniform(-0.03, 0.03))
        sahko_kwh += sk * kwh100 / 100
        bensa_l += bk * kul / 100 * (1 + rnd.uniform(-0.04, 0.04))
        odo += km
        paivakirja[d] = dict(odo=odo, sahko=sahko_kwh, bensa=bensa_l)
    return paivakirja


def auto_tiedot():
    pk = auto_sim()
    km_pv = lambda d: pk[d]["odo"]  # noqa: E731

    tankkaukset, lataukset = [], []
    # Tankkaus: täyteen, kun säiliössä on alle 12 l (50 l säiliö); määrä = kulunut määrä edellisestä täydestä.
    kapasiteetti, taso, edellinen_l = 50.0, 50.0, 0.0
    n = 0
    odotus = None
    for d in paivat():
        taso = kapasiteetti - (pk[d]["bensa"] - edellinen_l)
        if d == date(2024, 1, 3):  # lähtöpiste: ensimmäinen täysi tankkaus
            edellinen_l, taso = pk[d]["bensa"], kapasiteetti
            n += 1
            tankkaukset.append(dict(id=f"af{n:03d}", date=d.isoformat(), km=km_pv(d), qty=38.4, cost=70.9, full=True,
                                    grade="95 E10"))
            continue
        # Tankataan, kun säiliössä on alle 12 l (mieluiten viikonloppuna); pitkää ajopäivää edeltävänä iltana alle 38 l.
        matka = (taso < 12 and (d.weekday() >= 4 or taso < 6)) or (d + timedelta(days=1) in AUTO_RETKET and taso < 38)
        retki = d in (date(2025, 7, 5), date(2026, 7, 4))  # lomamatkojen lähtöpäivä: tankataan ennen matkaa/matkalla
        if not (matka or retki) or d < date(2024, 1, 4):
            continue
        qty = round(pk[d]["bensa"] - edellinen_l, 2)
        if qty < 5:
            continue
        hinta_l = VUODEN_HINTA[d.year] + 0.10 * math.sin((d.timetuple().tm_yday - 60) / 365 * 2 * math.pi) \
            + rnd.uniform(-0.04, 0.04)
        n += 1
        f = dict(id=f"af{n:03d}", date=d.isoformat(), km=km_pv(d), qty=qty, cost=round(qty * hinta_l, 2),
                 full=True, grade="98 E5" if rnd.random() < 0.15 else "95 E10")
        if d == date(2026, 7, 4):  # Viron-lomamatka: tankkaus euroina ulkomailla
            f["country"] = "EE"
        if d == date(2025, 7, 5):  # kesälomamatka Ruotsin kautta: tankkaus kruunuina
            sek_l = 16.9
            amt = round(qty * sek_l, 2)
            f.update(country="SE", cur="SEK", amt=amt, rate=11.0, cost=round(amt / 11.0, 2))
        edellinen_l, taso = pk[d]["bensa"], kapasiteetti
        tankkaukset.append(f)
    # Lataus: viikoittainen kotilatauksen mittarilukema (sunnuntaisin), kWh = edellisestä kulunut sähkö.
    edellinen_kwh, n, viimeksi = 0.0, 0, None
    for d in paivat():
        if d.weekday() != 6:
            continue
        if viimeksi is None:  # ensimmäinen lataus on lähtöpiste
            viimeksi = d
            edellinen_kwh = pk[d]["sahko"]
            n += 1
            lataukset.append(dict(id=f"al{n:03d}", date=d.isoformat(), km=km_pv(d), qty=21.0, cost=3.05, full=True, el=True))
            continue
        qty = round(pk[d]["sahko"] - edellinen_kwh, 2)
        if qty < 3:
            continue
        hinta = SAHKO_HINTA[d.year] + (0.045 if d.month in (12, 1, 2) else 0) + rnd.uniform(-0.012, 0.012)
        n += 1
        lataukset.append(dict(id=f"al{n:03d}", date=d.isoformat(), km=km_pv(d), qty=qty,
                              cost=round(qty * hinta, 2), full=True, el=True))
        edellinen_kwh = pk[d]["sahko"]

    omat = dict(t="self")
    korjaamo = dict(t="shop", n="Länsi-Auto Oy", tel="010 000 0001", mail="huolto@lansiauto.example",
                    addr="Esimerkkikatu 1, 00100 Helsinki", yt="0000000-0")
    rengas = dict(t="shop", n="Rengas-Pirkka", tel="010 000 0002", addr="Rengastie 5, 33100 Tampere")
    lasi = dict(t="shop", n="Lasihuolto Kirkas", tel="010 000 0003")
    kats = dict(t="shop", n="Katsastus Lehti")

    def ev(i, tyyppi, d, **k):
        pvm = date.fromisoformat(d)
        e = dict(id=f"ae{i:02d}", type=tyyppi, date=d, km=km_pv(pvm))
        e.update(k)
        e["created"] = stamp(d)
        return e

    tapahtumat = [
        ev(1, "Muu huolto", "2024-03-12", cost="58", by=omat, items=["Ilmansuodatin", "Raitisilmasuodatin", "Pyyhkijät"],
           note="Osat verkkokaupasta, vaihdettu itse. Säästö korjaamohintoihin verrattuna noin 60 €.",
           parts=[dict(name="Raitisilmasuodatin", qty="1", price="24"), dict(name="Ilmansuodatin", qty="1", price="22"),
                  dict(name="Pyyhkijänsulat", qty="1", price="12")]),
        ev(2, "Renkaiden vaihto", "2024-04-20", cost="49", by=rengas, items=["Kausivaihto", "Tasapainotus", "Rengashotelli"],
           note="Kesärenkaat alle, talvirenkaat rengashotelliin."),
        ev(3, "Autohoito", "2024-05-18", cost="14", by=omat, items=["Käsinpesu", "Kevytvaha", "Vanteiden pesu"],
           note="Kevätpesu ja vaha."),
        ev(4, "Renkaiden vaihto", "2024-10-24", cost="49", by=rengas, items=["Kausivaihto", "Rengashotelli"],
           note="Talvirenkaat alle."),
        ev(5, "Huolto", "2024-11-19", cost="362", by=korjaamo,
           items=["Moottoriöljy", "Öljynsuodatin", "Jarruneste", "Akku tarkistettu", "Valot tarkistettu",
                  "Rengaspaineet", "Huoltovälinäyttö nollattu"],
           note="Vuosihuolto ennen talvea. Jarruneste uusittu. Ei huomautettavaa."),
        ev(6, "Renkaiden vaihto", "2025-04-14", cost="772", by=rengas, items=["Uudet renkaat", "Tasapainotus", "Kausivaihto"],
           note="Uudet kesärenkaat, vanhat olivat kuluneet. Asennus ja tasapainotus samalla käynnillä.",
           parts=[dict(name="Kesärenkaat 235/45 R18 (4 kpl)", qty="4", price="696"),
                  dict(name="Venttiilit", qty="4", price="16")],
           labor="60", receipts=[kuitti(["RENGAS-PIRKKA", "Esimerkkikuitti", "", "Kesärenkaat 4 kpl   696,00",
                                         "Venttiilit 4 kpl     16,00", "Asennus ja tasap.  60,00", "",
                                         "YHTEENSA EUR      772,00", "", "Keksitty kuitti,", "ei oikea asiakas"])]),
        ev(7, "Katsastus", "2025-04-22", cost="64", by=kats, items=["Määräaikaiskatsastus"],
           note="Ensimmäinen katsastus, hyväksytty ilman huomautuksia."),
        ev(8, "Autohoito", "2025-05-17", cost="18", by=omat, items=["Käsinpesu", "Kevytvaha"], note="Kevätpesu."),
        ev(9, "Muu huolto", "2025-06-05", cost="119", by=korjaamo, items=["Ilmastointihuolto"],
           note="Ilmastoinnin huolto ennen kesää."),
        ev(10, "Korjaus ja osan vaihto", "2025-08-09", cost="49", by=lasi, items=["Lasit"],
           note="Kivenisku tuulilasissa, korjattu ennen kuin halkeama levisi. Uuden lasin hinta olisi ollut moninkertainen."),
        ev(11, "Renkaiden vaihto", "2025-10-23", cost="49", by=rengas, items=["Kausivaihto", "Rengashotelli"],
           note="Talvirenkaat alle."),
        ev(12, "Vuosihuolto", "2025-11-20", cost="389", by=korjaamo,
           items=["Moottoriöljy", "Öljynsuodatin", "Raitisilmasuodatin", "Jäähdytysneste", "Akku tarkistettu",
                  "Valot tarkistettu", "Rengaspaineet", "Huoltovälinäyttö nollattu"],
           note="Vuosihuolto. Korjaamo suositteli seuraavaksi etujarrujen tarkistusta.",
           receipts=[kuitti(["LANSI-AUTO OY", "Esimerkkikuitti", "", "Vuosihuolto           289,00",
                             "Raitisilmasuodatin     34,00", "Jaahdytysneste          66,00", "",
                             "YHTEENSA EUR        389,00", "", "Keksitty kuitti,", "ei oikea asiakas"])]),
        ev(13, "Muu huolto", "2026-01-15", cost="9", by=omat, items=["Polttimon vaihto"], note="Vasen lähivalo."),
        ev(14, "Renkaiden vaihto", "2026-04-21", cost="49", by=rengas, items=["Kausivaihto", "Rengashotelli"],
           note="Kesärenkaat alle."),
        ev(15, "Autohoito", "2026-05-16", cost="32", by=omat,
           items=["Käsinpesu", "Kestovaha", "Muoviosien ja tiivisteiden hoito"], note="Kestovaha ja tiivisteiden hoito."),
        ev(16, "Korjaus ja osan vaihto", "2026-06-17", cost="391", by=korjaamo, items=["Jarrut"],
           note="Etujarrulevyt ja -palat uusittu (suositus marraskuun huollosta). Koeajo ok.",
           parts=[dict(name="Jarrulevyt, etu (2 kpl)", qty="2", price="189"),
                  dict(name="Jarrupalat, etu (1 sarja)", qty="1", price="74")], labor="120", other="8",
           receipts=[kuitti(["LANSI-AUTO OY", "Esimerkkikuitti", "", "Jarrulevyt etu       189,00",
                             "Jarrupalat etu        74,00", "Tyo                  120,00", "Jatemaksu              8,00", "",
                             "YHTEENSA EUR        391,00", "", "Keksitty kuitti,", "ei oikea asiakas"])]),
        ev(17, "Renkaiden vaihto", "2026-10-27", cost="49", by=rengas, items=["Kausivaihto", "Rengashotelli"],
           note="Talvirenkaat alle."),
    ]
    muistiot = [
        dict(id="am1", date="2024-02-10", title="Rengaspaineet", text="Kesällä 2,5 bar, talvella 2,6 bar. Tarkista kuukausittain."),
        dict(id="am2", date="2025-03-18", title="Huoltosopimus",
             text="Korjaamon kanssa sovittu: vuosihuolto marraskuussa ennen talvea."),
        dict(id="am3", date="2026-06-17", title="Seuraavat",
             text="Jarrut uusittu kesäkuussa 2026. Seuraava iso kohta: katsastus huhtikuussa 2027."),
    ]
    auto = dict(id="tk-auto", name="Volvo V60", nick="Perheauto", plate="TST-301", year=2021, km=km_pv(LOPPU), body="wagon",
                color="#3b4d61", fuel="Lataushybridi", engine="T6 Recharge", events=list(reversed(tapahtumat)),
                fuels=sorted(tankkaukset + lataukset, key=lambda f: (f["date"], f["id"])),
                notes="Ladataan kotona yöllä. Ajastettu lataus talvella, jotta akku on lämmin aamulla.",
                memos=muistiot)
    return auto


# ---------------------------------------------------------------- Moottoripyörä
MOTO_KAUDET = {2024: (date(2024, 4, 27), date(2024, 10, 6)), 2025: (date(2025, 4, 26), date(2025, 10, 12)),
               2026: (date(2026, 4, 25), date(2026, 10, 10))}
MOTO_RETKET = {date(2024, 7, 20): 360, date(2024, 7, 21): 330, date(2024, 7, 22): 380, date(2024, 7, 23): 340,
               date(2025, 7, 12): 410, date(2025, 7, 13): 350, date(2025, 7, 14): 370, date(2025, 7, 15): 390,
               date(2025, 7, 16): 320, date(2026, 6, 20): 340, date(2026, 6, 21): 370, date(2026, 6, 22): 320}


def moto_tiedot():
    odo = 12350
    pk = {}
    litrat = 0.0
    for d in paivat():
        kausi = MOTO_KAUDET.get(d.year)
        km = 0
        if kausi and kausi[0] <= d <= kausi[1]:
            if d in MOTO_RETKET:
                km = MOTO_RETKET[d]
            elif d.weekday() >= 5:
                km = rnd.randint(110, 260) if rnd.random() < 0.6 else 0
            else:
                km = rnd.randint(35, 85) if rnd.random() < 0.2 else 0
        odo0, l0 = odo, litrat
        litrat += km * (5.5 + rnd.uniform(-0.45, 0.55) + (0.5 if d in MOTO_RETKET else 0)) / 100
        odo += km
        pk[d] = dict(odo=odo, l=litrat, odo0=odo0, l0=l0)
    km_pv = lambda d: pk[d]["odo"]  # noqa: E731

    # Tankkaus tehdään ajon aikana, kun säiliöstä on kulunut 12,5–16,5 l (säiliö 18 l). Pitkällä ajopäivällä
    # voi tulla kaksi tankkausta, joten päivän sisäinen mittarilukema lasketaan ajetun osuuden mukaan.
    tankkaukset, n = [], 0
    for v, (a, b) in MOTO_KAUDET.items():
        edellinen = pk[a]["l0"]  # talvisäilytykseen jätetään täysi tankki: sesongin alku on täysi
        raja = rnd.uniform(12.5, 16.5)
        for d in paivat():
            if not (a <= d <= b):
                continue
            p_ = pk[d]
            while p_["l"] - edellinen >= raja:
                osuus = (edellinen + raja - p_["l0"]) / (p_["l"] - p_["l0"])
                osuus = min(max(osuus, 0.0), 1.0)
                km = round(p_["odo0"] + (p_["odo"] - p_["odo0"]) * osuus)
                kulunut = p_["l0"] + (p_["l"] - p_["l0"]) * osuus
                qty = round(kulunut - edellinen, 2)
                n += 1
                hinta_l = VUODEN_HINTA[v] + 0.10 + rnd.uniform(-0.04, 0.05)
                f = dict(id=f"mf{n:03d}", date=d.isoformat(), km=km, qty=qty, cost=round(qty * hinta_l, 2),
                         full=True, grade="98 E5")
                if d == date(2025, 7, 14):  # lomamatka: tankkaus Norjassa kruunuina
                    amt = round(qty * 20.9, 2)
                    f.update(country="NO", cur="NOK", amt=amt, rate=11.7, cost=round(amt / 11.7, 2))
                tankkaukset.append(f)
                edellinen = kulunut
                raja = rnd.uniform(12.5, 16.5)
        # Kauden lopussa tankki täyteen talvisäilytystä varten
        qty = round(pk[b]["l"] - edellinen, 2)
        if qty >= 1:
            n += 1
            tankkaukset.append(dict(id=f"mf{n:03d}", date=b.isoformat(), km=km_pv(b), qty=qty,
                                    cost=round(qty * (VUODEN_HINTA[v] + 0.10), 2), full=True, grade="98 E5"))
    # Yksi tankkaus, jota ei lasketa kulutukseen (kaveri tankkasi välissä, määrä ei tiedossa): ensimmäinen elokuun 2025 jälkeen.
    for f in tankkaukset:
        if f["date"] >= "2025-08-01":
            f["skip"] = True
            break

    omat = dict(t="self")
    pajo = dict(t="shop", n="Moto-Pajo Oy", tel="010 000 0004", mail="info@motopajo.example", addr="Pajakatu 2, 40100 Jyväskylä")

    def ev(i, tyyppi, d, **k):
        pvm = date.fromisoformat(d)
        e = dict(id=f"me{i:02d}", type=tyyppi, date=d, km=km_pv(pvm))
        e.update(k)
        e["created"] = stamp(d)
        return e

    tapahtumat = [
        ev(1, "Käyttöönotto keväällä", "2024-04-27", by=omat, items=["Akku tarkistettu", "Valot tarkistettu", "Rengaspaineet"],
           note="Akku takaisin paikalleen, rengaspaineet ja valot tarkistettu. Kausi alkaa."),
        ev(2, "Huolto", "2024-05-04", cost="285", by=pajo,
           items=["Moottoriöljy", "Öljynsuodatin", "Ilmansuodatin", "Ketjun huolto", "Jarruneste"],
           note="Kevythuolto kauden alussa."),
        ev(3, "Renkaiden vaihto", "2024-06-15", cost="484", by=pajo, items=["Uudet renkaat"],
           note="Uudet matkarenkaat eteen ja taakse.",
           parts=[dict(name="Etu 120/70 ZR17", qty="1", price="189"), dict(name="Taka 180/55 ZR17", qty="1", price="239")],
           labor="56"),
        ev(4, "Pesu ja hoito", "2024-08-24", cost="12", by=omat, items=["Pesu", "Vahaus", "Satulan / istuimen hoito"],
           note="Pesu ja vaha lomamatkan jälkeen."),
        ev(5, "Talvisäilytykseen", "2024-10-12", cost="15", by=omat, items=["Akku tarkistettu"],
           note="Akku laturille, tankki täyteen ja stabilointiaine, pesu ja rasvaus. Peite päälle."),
        ev(6, "Käyttöönotto keväällä", "2025-04-26", by=omat, items=["Akku tarkistettu", "Valot tarkistettu", "Rengaspaineet"],
           note="Kevään käyttöönotto."),
        ev(7, "Huolto", "2025-05-06", cost="548", by=pajo,
           items=["Moottoriöljy", "Öljynsuodatin", "Ilmansuodatin", "Sytytystulpat", "Venttiilien säätö", "Jarruneste"],
           note="Isompi huolto: venttiilit säädetty.",
           receipts=[kuitti(["MOTO-PAJO OY", "Esimerkkikuitti", "", "Huoltotyo            210,00",
                             "Venttiilien saato    120,00", "Oljyt ja suodattimet  98,00", "Sytytystulpat         120,00",
                             "", "YHTEENSA EUR        548,00", "", "Keksitty kuitti,", "ei oikea asiakas"])]),
        ev(8, "Katsastus", "2025-05-20", cost="62", by=dict(t="shop", n="Katsastus Lehti"), items=[],
           note="Katsastettu ilman huomautuksia."),
        ev(9, "Korjaus ja osan vaihto", "2025-08-30", cost="86", by=pajo, items=["Sähkö ja valot"],
           note="Jarruvalokatkaisin vaihdettu.", parts=[dict(name="Jarruvalokatkaisin", qty="1", price="38")], labor="48"),
        ev(10, "Talvisäilytykseen", "2025-10-12", cost="15", by=omat, items=["Akku tarkistettu"],
           note="Sama rutiini kuin viime talvena."),
        ev(11, "Käyttöönotto keväällä", "2026-04-25", by=omat, items=["Akku tarkistettu", "Valot tarkistettu", "Rengaspaineet"],
           note="Kevään käyttöönotto."),
        ev(12, "Huolto", "2026-05-09", cost="59", by=omat, items=["Moottoriöljy", "Öljynsuodatin", "Ketjun huolto"],
           note="Öljynvaihto itse, työ onnistui hyvin. Kuvitteellinen esimerkki.",
           parts=[dict(name="Moottoriöljy 10W-40, 3,5 l", qty="1", price="36"), dict(name="Öljynsuodatin", qty="1", price="14"),
                  dict(name="Ketjuvoide", qty="1", price="9")]),
        ev(13, "Pesu ja hoito", "2026-07-18", cost="10", by=omat, items=["Pesu", "Vahaus"], note="Pesu ja vaha."),
        ev(14, "Huolto", "2026-09-05", cost="168", by=pajo, items=["Jarrupalat", "Jarruneste"],
           note="Jarrupalat ja jarruneste uusittu."),
        ev(15, "Talvisäilytykseen", "2026-10-10", cost="15", by=omat, items=["Akku tarkistettu"],
           note="Talvikuntoon, kausi 2026 päättyi."),
    ]
    muistiot = [
        dict(id="mm1", date="2024-10-12", title="Talvisäilytys",
             text="Akku laturille, tankki täyteen + stabilointiaine, rengaspaineet +0,5 bar, peite päälle."),
        dict(id="mm2", date="2025-05-06", title="Ketju", text="Voitele ketju noin 500 km välein ja aina sateen jälkeen."),
    ]
    return dict(id="tk-moto", kind="mc", name="Yamaha Tracer 9", nick="Kesäpyörä", plate="TST-302", year=2021,
                km=km_pv(LOPPU), body="touring", color="#2a2f3a", fuel="Bensiini", events=list(reversed(tapahtumat)),
                fuels=tankkaukset,
                notes="Kausiajoneuvo: ajossa huhti–lokakuussa, talvisäilytys rutiinilla.", memos=muistiot)


def main():
    data = {"app": "AJOURA", "version": 1, "saved": "2026-11-03T08:00:00.000Z",
            "cars": [auto_tiedot(), moto_tiedot()],
            "profile": {"name": "Testikäyttäjä", "months": 12, "km": 15000}}
    ULOS.parent.mkdir(exist_ok=True)
    ULOS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")
    for c in data["cars"]:
        print(c["name"], c["km"], "km;", len(c["events"]), "merkintää;", len(c["fuels"]), "tankkausta/latausta")
    print("Tallennettu", ULOS, ULOS.stat().st_size, "tavua")


if __name__ == "__main__":
    main()
