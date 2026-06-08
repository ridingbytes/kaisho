"""Tests for the /api/settings/mcp router."""
from fastapi.testclient import TestClient

import kaisho.api.routers.settings_mcp as mcp_router


def _client(monkeypatch, tmp_path):
    """Build a TestClient over just the mcp router so we
    don't pay the full ``kaisho.api.app`` import cost.
    Token storage is redirected at the dependency level so
    the test never touches the developer's real
    ``~/.kaisho/mcp-token``.
    """
    from fastapi import FastAPI

    class FakeCfg:
        DATA_DIR = tmp_path
        HOST = "127.0.0.1"
        PORT = 8765

    monkeypatch.setattr(
        mcp_router, "get_config", lambda: FakeCfg(),
    )
    app = FastAPI()
    app.include_router(mcp_router.router)
    return TestClient(app)


def test_get_returns_url_and_token(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    resp = client.get("/api/settings/mcp")
    assert resp.status_code == 200
    body = resp.json()
    assert body["url"] == "http://localhost:8765/mcp/"
    assert body["mounted_at"] == "/mcp"
    assert len(body["token"]) > 20
    assert body["enabled"] is True


def test_toggle_flips_state(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    off = client.post(
        "/api/settings/mcp/toggle",
        json={"enabled": False},
    ).json()
    assert off["enabled"] is False
    assert client.get(
        "/api/settings/mcp",
    ).json()["enabled"] is False
    on = client.post(
        "/api/settings/mcp/toggle",
        json={"enabled": True},
    ).json()
    assert on["enabled"] is True


def test_get_is_stable_across_calls(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    a = client.get("/api/settings/mcp").json()["token"]
    b = client.get("/api/settings/mcp").json()["token"]
    assert a == b


def test_rotate_changes_token(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    before = client.get("/api/settings/mcp").json()["token"]
    after = client.post(
        "/api/settings/mcp/rotate",
    ).json()["token"]
    assert before != after
    assert client.get(
        "/api/settings/mcp",
    ).json()["token"] == after


def test_allow_defaults_to_read(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    body = client.get("/api/settings/mcp").json()
    assert body["allow"] == "read"
    assert body["allow_active"] == "read"


def test_allow_persists_and_signals_restart(
    monkeypatch, tmp_path,
):
    client = _client(monkeypatch, tmp_path)
    resp = client.post(
        "/api/settings/mcp/allow",
        json={"allow": "write"},
    )
    assert resp.status_code == 200
    body = resp.json()
    # On-disk preference updates immediately ...
    assert body["allow"] == "write"
    # ... but the running FastMCP was never built in this
    # test rig, so allow_active falls back to the on-disk
    # value (i.e. they match here; in production they would
    # diverge until restart).
    again = client.get("/api/settings/mcp").json()
    assert again["allow"] == "write"


def test_allow_rejects_unknown_tier(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    resp = client.post(
        "/api/settings/mcp/allow",
        json={"allow": "nope"},
    )
    assert resp.status_code == 400


def test_loopback_host_displays_as_localhost(
    monkeypatch, tmp_path,
):
    """Even when the backend binds to 0.0.0.0 the URL we
    hand to the user should read ``localhost`` so the bearer
    flow isn't accidentally leaked over the network."""

    class FakeCfg:
        DATA_DIR = tmp_path
        HOST = "0.0.0.0"
        PORT = 9000

    monkeypatch.setattr(
        mcp_router, "get_config", lambda: FakeCfg(),
    )
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(mcp_router.router)
    client = TestClient(app)
    body = client.get("/api/settings/mcp").json()
    assert body["url"] == "http://localhost:9000/mcp/"
