"""Ajoura Plus -taustapalvelu (Supabase, v0.112): tietokannan muutos ja tekoälyfunktio.

- Tietokanta: supabase/migrations ajetaan paikalliseen PostgreSQL:ään Supabasen roolien jäljitelmän päälle
  (supabase/testit/supabase_stub.sql) kahdesti (ajo on toistettavissa), ja supabase/testit/test_plus.sql tarkistaa:
  selain ei pääse tauluihin eikä voi antaa itselleen Plussaa, vanhentunut ja peruttu tilaus = Free, kiintiö ei ylity.
  Ohitetaan, jos PostgreSQL:ää ei ole asennettu (apt-get install postgresql).
- Tekoälyfunktio: Node ajaa supabase/testit/tekoaly.test.mjs keksityllä Supabasella.
Oikeaan Supabase-projektiin testit eivät ota yhteyttä.
"""
import glob
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

import pytest

JUURI = Path(__file__).resolve().parent.parent
SB = JUURI / "supabase"


def _initdb():
    ehdokkaat = sorted(glob.glob("/usr/lib/postgresql/*/bin/initdb")) or [shutil.which("initdb") or ""]
    return ehdokkaat[-1] if ehdokkaat[-1] else None


@pytest.fixture(scope="module")
def postgres():
    initdb = _initdb()
    if not initdb:
        pytest.skip("PostgreSQL puuttuu (apt-get install -y postgresql): tietokantatesti ohitettiin")
    bindir = Path(initdb).parent
    kansio = Path(tempfile.mkdtemp(prefix="ajoura-pg-"))
    root = os.geteuid() == 0
    if root:  # initdb ei suostu root-käyttäjänä
        shutil.chown(kansio, "postgres")

    def aja(*cmd):
        komento = " ".join(f"'{c}'" for c in cmd)
        return subprocess.run(["su", "postgres", "-c", komento] if root else list(cmd), capture_output=True, text=True)

    portti = str(55000 + os.getpid() % 1000)
    r = aja(str(bindir / "initdb"), "-D", str(kansio / "data"), "-A", "trust", "-U", "postgres")
    assert r.returncode == 0, r.stderr
    r = aja(str(bindir / "pg_ctl"), "-D", str(kansio / "data"), "-o", f"-p {portti} -k {kansio} -c listen_addresses=", "-l", str(kansio / "log"), "-w", "start")
    assert r.returncode == 0, r.stderr + (kansio / "log").read_text(errors="replace")
    yield ["psql", "-X", "-q", "-h", str(kansio), "-p", portti, "-U", "postgres", "-v", "ON_ERROR_STOP=1"]
    aja(str(bindir / "pg_ctl"), "-D", str(kansio / "data"), "-m", "immediate", "stop")
    shutil.rmtree(kansio, ignore_errors=True)


def test_migraatio_ja_oikeudet(postgres):
    kanta = f"t{int(time.time() * 1000) % 10**9}"
    r = subprocess.run(postgres + ["-c", f"create database {kanta}"], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    tiedostot = [SB / "testit" / "supabase_stub.sql"]
    migraatiot = sorted((SB / "migrations").glob("*.sql"))
    assert migraatiot, "supabase/migrations on tyhjä"
    tiedostot += migraatiot + migraatiot  # kahdesti: ajon pitää olla toistettavissa
    tiedostot.append(SB / "testit" / "test_plus.sql")
    for f in tiedostot:
        r = subprocess.run(postgres + ["-d", kanta, "-f", str(f)], capture_output=True, text=True)
        assert r.returncode == 0, f"{f.name}: {r.stderr.strip()[-600:]}"
    assert "KAIKKI TARKISTUKSET OK" in r.stdout


def test_tekoalyfunktio():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node puuttuu: tekoälyfunktion testi ohitettiin")
    r = subprocess.run([node, "--test", str(SB / "testit" / "tekoaly.test.mjs")], capture_output=True, text=True, cwd=JUURI)
    assert r.returncode == 0, (r.stdout + r.stderr)[-2000:]
    assert re.search(r"^# fail 0$", r.stdout, re.M) and re.search(r"^# pass [1-9]", r.stdout, re.M), r.stdout[-800:]


def test_rakenne():
    """Jokainen funktio on rajattu selaimelta, jokainen julkaistava funktio on config.toml:ssä, eikä
    salaisia avaimia ole repossa."""
    sql = "\n".join(p.read_text(encoding="utf-8") for p in sorted((SB / "migrations").glob("*.sql")))
    for f in re.findall(r"create or replace function (public\.\w+)\(", sql):
        assert re.search(rf"revoke all on function {re.escape(f)}\([^)]*\) from public, anon, authenticated;", sql), \
            f"{f}: suoritusoikeutta ei ole rajattu (Supabase antaa sen oletuksena kaikille)"
    for t in re.findall(r"create table if not exists (public\.\w+)", sql):
        assert f"alter table {t} enable row level security;" in sql, f"{t}: rivitason suojaus (RLS) puuttuu"
    config = (SB / "config.toml").read_text(encoding="utf-8")
    for d in (SB / "functions").iterdir():
        if d.is_dir() and not d.name.startswith("_"):
            assert f"[functions.{d.name}]" in config, f"{d.name}: puuttuu config.toml:stä, joten sitä ei julkaista"
    for p in list(SB.rglob("*")) + [JUURI / "access.js"]:
        if p.is_file() and p.suffix in (".ts", ".sql", ".toml", ".js", ".mjs"):
            teksti = p.read_text(encoding="utf-8")
            assert not re.search(r"sb_secret_[A-Za-z0-9]{10}|service_role\"?\s*:\s*\"ey|sbp_[a-f0-9]{20}", teksti), f"{p}: salainen avain repossa"
