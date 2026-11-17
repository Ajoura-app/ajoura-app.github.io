"""GPS data actions of the gps-traccar function (devices, position, trips, route, stops).

Runs the mocked Node tests (invented data, no real Traccar or Supabase) and checks the source for
rules that must hold even if someone edits the function later: read-only, fixed paths, no logging.
"""
from pathlib import Path
import re
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "supabase/functions/gps-traccar/index.ts"


def test_gps_data_mocked_api():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node not installed")
    result = subprocess.run(
        [node, "--test", "--test-reporter=tap",
         str(ROOT / "supabase/testit/gps-traccar-data.test.mjs")],
        text=True, capture_output=True, cwd=ROOT, check=False,
    )
    assert result.returncode == 0, (result.stdout + result.stderr)[-2500:]
    assert re.search(r"^# fail 0$", result.stdout, re.M)
    assert re.search(r"^# pass (1[5-9]|[2-9]\d)$", result.stdout, re.M)


def test_gps_function_stays_read_only_and_quiet():
    src = SOURCE.read_text(encoding="utf-8")
    # Only these Traccar paths may appear; no commands, users, permissions or geofences.
    paths = set(re.findall(r"'(/api/[a-z/]+)'", src))
    assert paths == {"/api/devices", "/api/positions", "/api/reports/trips", "/api/reports/stops"}, paths
    for forbidden in ["/api/commands", "/api/users", "/api/permissions", "/api/session"]:
        assert forbidden not in src
    assert not re.search(r"method:\s*'(POST|PUT|PATCH|DELETE)'", src)
    # Locations and tokens are never written to logs.
    assert not re.search(r"\bconsole\.", src)
    # Only the fixed Traccar host is called with the token.
    assert src.count("fetcher(") == 2
    assert "fetcher(TRACCAR + path" in src
    # Limits that keep a single request bounded.
    for name in ["MAX_TRIPS_RANGE", "MAX_DAY_RANGE", "MAX_POINTS", "RATE_LIMIT", "MAX_ROUTE_JSON"]:
        assert re.search(rf"const {name} = ", src), name


def test_gps_device_hardware_ids_not_returned():
    src = SOURCE.read_text(encoding="utf-8")
    # The device list is rebuilt field by field; raw Traccar device objects are never sent on.
    block = src[src.index("action === 'devices'"):src.index("const device = await owned")]
    for field in ["uniqueId", "phone", "contact", "model"]:
        assert field not in block.replace("never uniqueId (IMEI), phone, model or contact", "")
