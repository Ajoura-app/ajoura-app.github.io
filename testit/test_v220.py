"""2.20 (Niklas): Raporttien yhteinen tapahtumalista. Tankkaukset, lataukset ja merkinnät samassa listassa uusin
ensin; napautus avaa tiedot samalla sivulla (aria-expanded), suodatus ei muuta summia, Näytä lisää, muokkaus
olemassa olevilla lomakkeilla. Tallennetut tiedot eivät muutu."""
import json

import pytest

import tiedot
from apu import KELLO, avaa

RIVIT = """() => [...document.querySelectorAll('.rx-list .rx-row')].map(b => ({id: b.dataset.rx,
  nimi: b.querySelector('strong').innerText, ali: b.querySelector('small').innerText, eur: b.querySelector('.rx-eur').innerText,
  auki: b.getAttribute('aria-expanded')}))"""
SUMMAT = """() => [...document.querySelectorAll('.fv-card .fv-val')].map(e => e.innerText)"""


def avaa_raportit(browser, base, p="all", car="", **k):
    return avaa(browser, base, "reports", autot=tiedot.talli(), kello=KELLO,
                extra={"ajoura-reports": json.dumps({"p": p, "car": car})}, **k)


def test_kaikki_tapahtumat_aikajarjestyksessa(browser, base):
    s = avaa_raportit(browser, base)
    try:
        p = s.page
        r = p.evaluate(RIVIT)
        # 11 kirjausta: 6 merkintää ja 5 tankkausta/latausta; näkyvissä 10 ja Näytä lisää (1).
        assert len(r) == 10 and p.inner_text('[data-rx-more]').replace('\n', ' ') == 'Näytä lisää (1)', r
        assert r[0]["id"] == "f-tst2-f5" and r[0]["nimi"] == "Lataus" and r[0]["ali"] == "Kia Niro EV · 20.9.2026", r
        assert r[0]["eur"] == "11,50 €"
        assert [x["nimi"] for x in r[2:5]] == ["Tankkaus"] * 3
        paivat = [x["ali"].split(" · ")[-1] for x in r]
        iso = ["-".join(reversed([f"{int(v):02d}" for v in d.split(".")])) for d in paivat]
        assert iso == sorted(iso, reverse=True), paivat
        p.click('[data-rx-more]')
        r2 = p.evaluate(RIVIT)
        assert len(r2) == 11 and r2[-1]["nimi"] == "Huolto" and r2[-1]["ali"].endswith("14.3.2025")
        assert p.locator('[data-rx-more]').count() == 0
        assert p.evaluate("document.activeElement.dataset.rx") == r2[10]["id"]
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_laajennus_samalla_sivulla(browser, base):
    s = avaa_raportit(browser, base)
    try:
        p = s.page
        hash0 = p.evaluate("location.hash")
        rivi = p.locator('[data-rx="f-tst1-f2"]')
        paneeli = p.locator('#rx-f-tst1-f2')
        assert rivi.get_attribute('aria-expanded') == 'false' and paneeli.is_hidden()
        rivi.click()
        assert rivi.get_attribute('aria-expanded') == 'true' and paneeli.is_visible()
        t = paneeli.inner_text().replace('\xa0', ' ')
        # 41,2 l, 70,50 €, 1,711 €/l, 151 750 km, kulutus 41,2 l / 750 km = 5,5 l/100 km (sama kuin tankkauskirjassa).
        for osa in ["41,20 l", "70,50 €", "1,711 €/l", "151 750 km", "5,5 l/100 km"]:
            assert osa in t, t
        assert p.evaluate("location.hash") == hash0
        # Näppäimistö: Enter sulkee.
        rivi.focus(); p.keyboard.press("Enter")
        assert rivi.get_attribute('aria-expanded') == 'false' and paneeli.is_hidden()
        # Lataus: kWh ja kWh/100 km, ei litroja.
        p.click('[data-rx="f-tst2-f5"]')
        t = p.inner_text('#rx-f-tst2-f5')
        assert "45,00 kWh" in t and "0,26 €/kWh" in t and "kWh/100 km" in t and " l" not in t.replace("Ladattu", ""), t
        # Huolto: toimenpiteet, tekijä, muistiinpano, kuitit ja muokkaus nykyisellä lomakkeella.
        p.click('[data-rx-more]')
        p.click('[data-rx="e-tst1-e1"]')
        t = p.inner_text('#rx-e-tst1-e1').replace('\xa0', ' ')
        for osa in ["289 €", "128 900 km", "Moottoriöljy", "Testikorjaamo Oy", "Määräaikaishuolto", "1 kuitti"]:
            assert osa in t, t
        assert p.get_attribute('#rx-e-tst1-e1 a.rx-act', 'href') == '#edit/tst1/e1'
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_suodatus_ei_muuta_summia(browser, base):
    s = avaa_raportit(browser, base, p="year")
    try:
        p = s.page
        summat = p.evaluate(SUMMAT)
        for f, n in [("fuel", 5), ("svc", 3), ("other", 1), ("all", 9)]:
            p.click(f'[data-rx-f="{f}"]')
            assert p.get_attribute(f'[data-rx-f="{f}"]', 'aria-pressed') == 'true'
            r = p.evaluate(RIVIT)
            assert len(r) == n, (f, r)
            assert p.evaluate(SUMMAT) == summat
        p.click('[data-rx-f="other"]')
        assert [x["nimi"] for x in p.evaluate(RIVIT)] == ["Katsastus"]
        # Valinta säilyy laitteessa (näkymäasetus), ei tallennetuissa tiedoissa.
        assert json.loads(p.evaluate("localStorage.getItem('ajoura-reports')"))["ef"] == "other"
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_ajoneuvo_ja_jakso_rajaavat(browser, base):
    s = avaa_raportit(browser, base, p="year", car="tst2")
    try:
        r = s.page.evaluate(RIVIT)
        assert [x["id"] for x in r] == ["f-tst2-f5", "f-tst2-f4", "e-tst2-e5"], r
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tankkauksen_muokkaus_paivittaa_listan(browser, base):
    s = avaa_raportit(browser, base)
    try:
        p = s.page
        p.click('[data-rx="f-tst1-f3"]')
        p.click('[data-rx-fill="f3"]')
        p.wait_for_selector('#quickfuel-form')
        assert p.locator('#quickfuel-form').get_attribute('data-car') == 'tst1'
        p.fill('#quickfuel-form [name=cost]', '70')
        p.locator('#quickfuel-form [type=submit]').click()
        p.wait_for_selector('.sheet-layer', state='detached')
        p.wait_for_selector('[data-rx="f-tst1-f3"]')
        assert p.inner_text('[data-rx="f-tst1-f3"] .rx-eur') == '70,00 €'
        f3 = [f for c in s.talli()["cars"] for f in c.get("fuels", []) if f["id"] == "f3"][0]
        assert f3["cost"] == 70
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


@pytest.mark.parametrize("leveys", [320, 390])
@pytest.mark.parametrize("teema", [None, "dark"])
def test_ei_ylivuotoa_ja_kosketusalueet(browser, base, leveys, teema):
    s = avaa_raportit(browser, base, leveys=leveys, teema=teema)
    try:
        p = s.page
        p.click('[data-rx="e-tst1-e4"]')
        r = p.evaluate("""() => {const sc = document.querySelector('#app-screen');
          const rivit = [...document.querySelectorAll('.rx-row, .rx-act, .rx-filter button, [data-rx-more]')].map(e => e.getBoundingClientRect()).filter(q => q.height);
          const fontit = [...document.querySelectorAll('.rx-card *')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
            .map(e => parseFloat(getComputedStyle(e).fontSize));
          return {sivu: sc.scrollWidth - sc.clientWidth, matala: rivit.filter(q => q.height < 36).length,
                  toiminnot: [...document.querySelectorAll('.rx-act')].map(e => e.getBoundingClientRect().height).filter(h => h), pienin: Math.min(...fontit)};}""")
        assert r["sivu"] <= 0 and r["matala"] == 0, r
        assert all(h >= 44 for h in r["toiminnot"]) and r["pienin"] >= 11, r
        assert not s.virheet, s.virheet
    finally:
        s.sulje()


def test_tallennettu_jarjestys_saa_listan_kuvakorttien_jalkeen(browser, base):
    vanha = {"p": "year", "w": ["months", "tot", "mon", "fuel", "svc", "dist", "cars", "exp"]}
    s = avaa(browser, base, "reports", autot=tiedot.talli(), kello=KELLO, extra={"ajoura-reports": json.dumps(vanha)})
    try:
        w = s.page.evaluate("[...document.querySelectorAll('.rp-wgrid>[data-fw]')].map(e => e.dataset.fw)")
        assert w == ["months", "tot", "mon", "fuel", "svc", "events", "dist", "cars", "exp"], w
        assert not s.virheet, s.virheet
    finally:
        s.sulje()
