"""Tests the read-only Traccar connectivity probe with fake Supabase and Traccar responses.

These tests never contact the live Traccar server or need any real API tokens.
"""
from pathlib import Path
import re
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parent.parent


def test_gps_traccar_mocked_api():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node not installed")
    result = subprocess.run(
        [node, "--test", "--test-reporter=tap",
         str(ROOT / "supabase/testit/gps-traccar.test.mjs")],
        text=True, capture_output=True, cwd=ROOT, check=False,
    )
    assert result.returncode == 0, (result.stdout + result.stderr)[-2500:]
    assert re.search(r"^# fail 0$", result.stdout, re.M)
    assert re.search(r"^# pass [1-9]", result.stdout, re.M)


def test_gps_traccar_not_published_without_auth():
    config = (ROOT / "supabase/config.toml").read_text(encoding="utf-8")
    source = (ROOT / "supabase/functions/gps-traccar/index.ts").read_text(encoding="utf-8")
    assert re.search(r"\[functions\.gps-traccar\][^\[]*verify_jwt\s*=\s*true", config)
    assert "TRACCAR_TEST_OWNER_ID" in source
    assert "TRACCAR_API_TOKEN" in source
    assert "'https://server.traccar.org'" in source
    assert "authorization" in source.lower()
    assert "auth/v1/user" in source
    assert "fetcher(TRACCAR + path" in source
    assert "Cache-Control" in source
    assert "/api/devices" in source and "/api/positions" in source
    assert "method: 'POST'" not in source
