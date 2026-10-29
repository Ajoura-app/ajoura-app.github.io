"""Keksityt testitiedot. Älä koskaan lisää tänne oikeita tietoja: repo on julkinen."""
import base64
import io
import json

from PIL import Image


def jpeg(vari=(30, 90, 200), koko=(16, 12)):
    """Pieni JPEG data-osoitteena (kuvat ja kuitit)."""
    b = io.BytesIO()
    Image.new("RGB", koko, vari).save(b, "JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()


def auto(id="tst1", **k):
    """Henkilöauto. Kentät kuten app.js:n validCar odottaa."""
    c = dict(id=id, name="Skoda Octavia", plate="TST-101", year=2019, km=152400,
             body="wagon", color="#2b4a6f", fuel="Diesel", events=[], fuels=[])
    c.update(k)
    return c


def merkinta(id, tyyppi, pvm, km, **k):
    e = dict(id=id, type=tyyppi, date=pvm, km=km)
    e.update(k)
    return e


def tankkaus(id, pvm, km, litrat, hinta, taysi=True, **k):
    f = dict(id=id, date=pvm, km=km, qty=litrat, cost=hinta, full=taysi)
    f.update(k)
    return f


def talli():
    """Monipuolinen talli: auto (kaikki kenttätyypit), sähköauto ja vene."""
    a = auto(events=[
        merkinta("e1", "Huolto", "2025-03-14", 128900, cost="289", note="Määräaikaishuolto",
                 items=["Moottoriöljy", "Öljynsuodatin", "Ilmansuodatin"],
                 by={"t": "shop", "n": "Testikorjaamo Oy", "tel": "0401234567", "yt": "1234567-8"},
                 created="2025-03-14T12:00:00.000Z", receipts=[jpeg((240, 240, 230))]),
        merkinta("e2", "Renkaiden vaihto", "2025-10-20", 141200, cost="60",
                 items=["Kausivaihto", "Rengashotelli"], by={"t": "self"}),
        merkinta("e3", "Katsastus", "2026-02-10", 147800, cost="54", items=["Määräaikaiskatsastus"]),
        merkinta("e4", "Korjaus ja osan vaihto", "2026-06-02", 150900, cost="412",
                 items=["Jarrut"], note="Etujarrut", photos=[jpeg((180, 60, 40))],
                 parts=[{"name": "Jarrupalat", "qty": "1", "price": "89"}]),
    ], fuels=[
        tankkaus("f1", "2026-07-01", 151000, 50.0, 85.0),
        tankkaus("f2", "2026-07-20", 151750, 41.2, 70.5),
        tankkaus("f3", "2026-08-05", 152400, 38.9, 66.8),
    ], memos=[{"id": "m1", "date": "2026-05-01", "title": "Renkaat", "text": "205/55 R16"}])
    s = auto(id="tst2", name="Kia Niro EV", plate="TST-202", year=2022, km=48200, body="suv",
             fuel="Sähkö", color="#d9dde2",
             events=[merkinta("e5", "Huolto", "2026-04-04", 45100, cost="199", items=["Jarruneste"])],
             fuels=[tankkaus("f4", "2026-09-01", 47800, 40.0, 10.0),
                    tankkaus("f5", "2026-09-20", 48200, 45.0, 11.5)])
    v = dict(id="tst3", kind="boat", body="open", name="Testivene", nick="", plate="TST-V1",
             year=2015, km=320, color="#ffffff", fuel="Bensiini",
             events=[merkinta("e6", "Kausihuolto", "2026-05-10", 300, cost="150",
                              items=["Moottoriöljy", "Siipipyörä"])], fuels=[])
    return [a, s, v]


def tila(autot, sequence=100):
    """localStorage-avaimen ajoura-app-v2 sisältö."""
    return json.dumps({"cars": autot, "sequence": sequence,
                       "profile": {"name": "", "months": 12, "km": 15000}})
