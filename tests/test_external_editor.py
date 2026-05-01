"""Tests for the external-editor feature.

Covers:
- ``/api/files/path`` returns abs paths for known kinds
  on the org backend, and 400 for unknown kinds.
- The ``external_editor`` settings block round-trips
  through GET/PATCH.
"""
import pytest


@pytest.fixture(autouse=True)
def _isolate_env(tmp_path, monkeypatch):
    data_dir = tmp_path / ".kaisho"
    profile_dir = data_dir / "profiles" / "default"
    profile_dir.mkdir(parents=True)
    org_dir = profile_dir / "org"
    org_dir.mkdir()
    for f in (
        "todos.org", "clocks.org", "customers.org",
        "inbox.org", "notes.org", "archive.org",
    ):
        (org_dir / f).write_text("", encoding="utf-8")

    monkeypatch.setenv("KAISHO_HOME", str(data_dir))
    monkeypatch.setenv("PROFILE", "default")

    from kaisho.config import reset_config
    from kaisho.backends import get_backend
    reset_config()
    get_backend.cache_clear()
    yield
    reset_config()
    get_backend.cache_clear()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from kaisho.api.app import app
    return TestClient(app, raise_server_exceptions=False)


def test_files_path_known_kinds(client):
    for kind in ("tasks", "clocks", "notes", "inbox"):
        r = client.get(f"/api/files/path?kind={kind}")
        assert r.status_code == 200, (kind, r.text)
        body = r.json()
        assert "path" in body
        assert "exists" in body
        assert body["path"].endswith(".org")


def test_files_path_unknown_kind_400(client):
    r = client.get("/api/files/path?kind=nope")
    assert r.status_code == 400


def test_external_editor_default(client):
    r = client.get("/api/settings/external_editor")
    assert r.status_code == 200
    data = r.json()
    assert data == {"enabled": False, "command": ""}


def test_external_editor_patch_roundtrip(client):
    r = client.patch(
        "/api/settings/external_editor",
        json={
            "enabled": True,
            "command": 'alacritty -e nvim "{file}"',
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is True
    assert body["command"] == 'alacritty -e nvim "{file}"'

    r2 = client.get("/api/settings/external_editor")
    assert r2.json() == body
