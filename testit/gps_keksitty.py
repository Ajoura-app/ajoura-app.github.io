"""Keksitty gps-traccar-palvelu ja kuntarajat testeihin (ei oikeita sijainteja). Ajat suhteessa nykyhetkeen."""
import json
import time
from urllib.parse import urlparse, parse_qs

SB = "https://sjamwwcqrwspwvilurqn.supabase.co"
GPS = SB + "/functions/v1/gps-traccar"
A = (62.79, 22.84)   # Testikunta A:n keskusta
B = (63.10, 21.62)   # Testikunta B:n keskusta
KUNNAT = {"meta": {"versio": 1, "lahde": "keksitty testiaineisto"}, "kunnat": [
    ["Testikunta A", [22.5, 62.6, 23.2, 63.0], [[[22.5, 62.6, 23.2, 62.6, 23.2, 63.0, 22.5, 63.0, 22.5, 62.6]]]],
    ["Testikunta B", [21.3, 62.95, 22.0, 63.3], [[[21.3, 62.95, 22.0, 62.95, 22.0, 63.3, 21.3, 63.3, 21.3, 62.95]]]],
]}


def iso(t):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))


from datetime import datetime, timezone
KELLO = datetime(2026, 11, 18, 14, 0, tzinfo=timezone.utc)  # ke 18.11.2026 klo 16.00 Suomen aikaa
NYT = int(KELLO.timestamp())  # kiinteä: samat ajot jokaisella kutsulla; testit lukitsevat selaimen kellon tähän


def ajot(nyt=None):
    """Kolme ajoa: viime tunteina kaksi (A→B ja B→A), toissapäivänä yksi ilman paikkaa (pisteet merellä)."""
    nyt = NYT
    t0 = nyt - 4 * 3600
    return [
        {"key": "7-1003", "start": iso(t0 + 7200), "end": iso(t0 + 7200 + 3960), "durationS": 3960, "distanceM": 78400, "avgSpeedKmh": 71, "maxSpeedKmh": 98,
         "startPoint": list(B), "endPoint": list(A), "startAddress": "Testikatu 2, 65100 Testikunta B, Finland", "endAddress": None},
        {"key": "7-1002", "start": iso(t0), "end": iso(t0 + 3960), "durationS": 3960, "distanceM": 78000, "avgSpeedKmh": 71, "maxSpeedKmh": 96,
         "startPoint": list(A), "endPoint": list(B), "startAddress": None, "endAddress": None},
        {"key": "7-1001", "start": iso(nyt - 2 * 86400), "end": iso(nyt - 2 * 86400 + 1320), "durationS": 1320, "distanceM": 18000, "avgSpeedKmh": 49, "maxSpeedKmh": 80,
         "startPoint": [60.0, 20.0], "endPoint": [60.1, 20.1], "startAddress": None, "endAddress": None},
    ]


def palvelin(context, tila=None):
    """Reitittää gps-traccar-kutsut. tila['pyynnot'] = kyselyt; tila['virhe'] = HTTP-tila kaikille."""
    tila = tila if tila is not None else {}
    tila.setdefault("pyynnot", [])

    def vastaa(route):
        q = {k: v[0] for k, v in parse_qs(urlparse(route.request.url).query).items()}
        tila["pyynnot"].append(q)
        if tila.get("virhe"):
            return route.fulfill(status=tila["virhe"], content_type="application/json", body=json.dumps({"ok": False, "error": tila.get("koodi", "x")}))
        a = q.get("action", "status")
        nyt = NYT
        if a == "devices":
            body = {"ok": True, "devices": tila.get("laitteet", [{"id": 7, "name": "Testiauto", "status": "online", "lastUpdate": iso(nyt - 30)}])}
        elif a == "position":
            ika = tila.get("ika", 40)
            body = {"ok": True, "position": {"point": list(A), "fixTime": iso(nyt - ika), "ageSeconds": ika, "fresh": ika <= 600, "speedKmh": 0, "course": 90}}
        elif a == "trips":
            f, t = q["from"], q["to"]
            body = {"ok": True, "trips": [x for x in ajot() if f <= x["start"] <= t], "truncated": False, "dropped": 0}
        elif a == "route":
            pts = [[A[0] + (B[0] - A[0]) * i / 20, A[1] + (B[1] - A[1]) * i / 20, int(nyt), 70] for i in range(21)]
            body = {"ok": True, "points": pts, "simplified": False}
        elif a == "stops":
            body = {"ok": True, "stops": [{"start": iso(NYT - 4 * 3600 + 3960), "end": iso(NYT - 4 * 3600 + 7200), "durationS": 3240, "point": list(B), "address": None}], "truncated": False}
        else:
            body = {"ok": True}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(body))
    context.route(GPS + "*", vastaa)
    context.route("**/kartta-data/kunnat.json", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(tila.get("kunnat", KUNNAT))))
    return tila
