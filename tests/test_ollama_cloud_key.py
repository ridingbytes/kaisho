"""Regression tests for the Ollama Cloud API key.

These exercise the four places that all needed to know about
``ollama_cloud_api_key`` for the cron path to work:
- ``DEFAULT_AI`` so it is in the GET response (formerly missing)
- ``_SECRET_KEYS`` so it is masked in the GET response
- ``AiSettingsUpdate`` so PATCH does not silently drop it
- the ``/ai/probe`` endpoint so the green dot reflects the
  cloud key, not the local one
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


def test_get_includes_cloud_key_set_field(client):
    """GET /api/settings/ai must surface
    ``ollama_cloud_api_key_set`` (from default + mask)."""
    r = client.get("/api/settings/ai")
    assert r.status_code == 200
    body = r.json()
    assert "ollama_cloud_api_key_set" in body
    assert body["ollama_cloud_api_key_set"] is False


def test_patch_persists_cloud_key(client):
    """PATCH must not drop ``ollama_cloud_api_key``
    (the Pydantic model used to be missing the field, so
    the value was silently ignored)."""
    r = client.patch(
        "/api/settings/ai",
        json={
            "ollama_cloud_url": "https://ollama.com",
            "ollama_cloud_api_key": "OLLAMA_CLOUD_VALUE",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ollama_cloud_api_key_set"] is True
    # Raw key must NOT leak in the GET response.
    assert "ollama_cloud_api_key" not in body or (
        body.get("ollama_cloud_api_key") == ""
    )


def test_patch_separates_local_and_cloud_keys(client):
    """Setting the cloud key must not overwrite the local
    Ollama key, and vice versa. The frontend used to bind
    the cloud-key input to ``ollama_api_key``; this test
    locks the bindings down."""
    client.patch(
        "/api/settings/ai",
        json={"ollama_api_key": "LOCAL"},
    )
    client.patch(
        "/api/settings/ai",
        json={"ollama_cloud_api_key": "CLOUD"},
    )

    # Verify by reading the raw settings (mask hides the
    # values, so we go behind the API for verification).
    from kaisho.config import get_config
    from kaisho.services import settings as s
    cfg = get_config()
    raw = s.get_ai_settings(s.load_settings(
        cfg.SETTINGS_FILE,
    ))
    assert raw["ollama_api_key"] == "LOCAL"
    assert raw["ollama_cloud_api_key"] == "CLOUD"


def test_probe_uses_cloud_key_for_cloud(client):
    """The probe must report ``ollama_cloud: true`` only
    when both the cloud URL AND the cloud key are set."""
    # Only local key + cloud URL → not enough.
    client.patch(
        "/api/settings/ai",
        json={
            "ollama_url": "http://localhost:11434",
            "ollama_api_key": "LOCAL",
            "ollama_cloud_url": "https://ollama.com",
        },
    )
    r = client.get("/api/settings/ai/probe").json()
    assert r["ollama_cloud"] is False

    # Add cloud key → green.
    client.patch(
        "/api/settings/ai",
        json={"ollama_cloud_api_key": "CLOUD"},
    )
    r = client.get("/api/settings/ai/probe").json()
    assert r["ollama_cloud"] is True
