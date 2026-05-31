"""Tests for the Phase-1.6 follow-up: push-health +
push-sync HTTP endpoints + their integration with the
sync engine."""
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
    from kaisho.services import caldav as svc
    svc._cache.clear()
    yield
    reset_config()
    get_backend.cache_clear()
    svc._cache.clear()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from kaisho.api.app import app
    return TestClient(app, raise_server_exceptions=False)


def _seed_account(svc):
    from datetime import datetime, timezone
    aid = "ac_health"
    data = svc._load_settings()
    data["accounts"].append({
        "id": aid, "label": "h", "preset": "fastmail",
        "url": "https://srv/", "username": "u",
        "enabled_calendars": [],
        "created_at": datetime.now(
            timezone.utc,
        ).isoformat(),
        "storage": "keyring",
        "push_enabled": True,
        "push_calendar_id": "https://srv/c/",
        "push_enabled_since": "2026-05-30T00:00:00+00:00",
    })
    svc._save_settings(data)
    return aid


class TestGetPushHealth:
    def test_unknown_account_returns_404(self, client):
        r = client.get(
            "/api/caldav/accounts/ac_nope/push-health",
        )
        assert r.status_code == 404

    def test_known_account_with_no_history_returns_zeros(
        self, client,
    ):
        from kaisho.services import caldav as svc
        aid = _seed_account(svc)
        r = client.get(
            f"/api/caldav/accounts/{aid}/push-health",
        )
        assert r.status_code == 200
        assert r.json() == {
            "failure_count": 0,
            "last_error": None,
            "last_success_at": None,
            "degraded": False,
        }


class TestPushSyncEndpoint:
    def test_unknown_account_returns_404(self, client):
        r = client.post(
            "/api/caldav/accounts/ac_nope/push-sync",
        )
        assert r.status_code == 404

    def test_returns_summary_and_health(
        self, client, monkeypatch,
    ):
        from kaisho.services import caldav as svc
        from kaisho.services import caldav_sync
        aid = _seed_account(svc)

        captured = {"called": False}

        def fake_sync_now():
            captured["called"] = True
            return {
                "created": 2, "updated": 1, "deleted": 0,
                "skipped": 3, "errors": 0,
            }

        monkeypatch.setattr(
            caldav_sync, "sync_now", fake_sync_now,
        )

        r = client.post(
            f"/api/caldav/accounts/{aid}/push-sync",
        )
        assert r.status_code == 200, r.text
        assert captured["called"] is True
        body = r.json()
        assert body["summary"] == {
            "created": 2, "updated": 1, "deleted": 0,
            "skipped": 3, "errors": 0,
        }
        # health key always present even with no history.
        assert "failure_count" in body["health"]
