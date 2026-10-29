"""Yhteiset testivalmistelut: paikallinen palvelin ja Chromium-selain.

Palvelin käynnistyy testiajon alussa ja sammuu sen lopussa, joten erillistä taustapalvelinta ei tarvita.
Oletuksena palvellaan tämän repon juurikansiota; ympäristömuuttuja AJOURA_JUURI vaihtaa kansion
(esim. vanhan version vertailuun git worktree -kansiosta).
"""
import functools
import http.server
import os
import threading
from pathlib import Path

import pytest

if not os.environ.get("PLAYWRIGHT_BROWSERS_PATH") and Path("/opt/pw-browsers").is_dir():
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "/opt/pw-browsers"

from playwright.sync_api import sync_playwright  # noqa: E402

JUURI = Path(os.environ.get("AJOURA_JUURI") or Path(__file__).resolve().parent.parent)


class _Hiljainen(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def palvelin(juuri):
    """Käynnistää palvelimen vapaaseen porttiin; palauttaa (osoite, sammutusfunktio)."""
    h = functools.partial(_Hiljainen, directory=str(juuri))
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{s.server_address[1]}", s.shutdown


@pytest.fixture(scope="session")
def base():
    if not (JUURI / "app.html").is_file():
        pytest.exit(f"app.html puuttuu kansiosta {JUURI}")
    osoite, sammuta = palvelin(JUURI)
    yield osoite
    sammuta()


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


@pytest.fixture(scope="session")
def vanha_base():
    """Edellinen versio vertailuun: kansio ympäristömuuttujassa AJOURA_VERTAILU (git worktree, ks. README)."""
    kansio = os.environ.get("AJOURA_VERTAILU")
    if not kansio or not (Path(kansio) / "app.html").is_file():
        pytest.skip("AJOURA_VERTAILU puuttuu: anna edellisen version kansio (ks. testit/README.md)")
    osoite, sammuta = palvelin(Path(kansio).resolve())
    yield osoite
    sammuta()
