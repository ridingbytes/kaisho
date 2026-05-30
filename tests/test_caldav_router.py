"""API router tests for /api/caldav.

The underlying ``caldav`` library is mocked via the service
layer (``_principal`` patched to a stub). Keyring is also
stubbed so the suite does not touch the macOS keychain.
"""
import pytest
from unittest.mock import MagicMock
from datetime import datetime, timezone


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
def fake_keyring(monkeypatch):
    store = {}
    import keyring
    monkeypatch.setattr(
        keyring, "set_password",
        lambda s, a, p: store.update({(s, a): p}),
    )
    monkeypatch.setattr(
        keyring, "get_password",
        lambda s, a: store.get((s, a)),
    )
    monkeypatch.setattr(
        keyring, "delete_password",
        lambda s, a: store.pop((s, a), None),
    )
    return store


@pytest.fixture
def fake_principal(monkeypatch):
    """Stub a CalDAV principal with one calendar that
    returns one event on search."""
    from kaisho.services import caldav as svc

    vevent = MagicMock()
    dtstart = MagicMock()
    dtstart.dt = datetime(
        2026, 5, 30, 10, 0, tzinfo=timezone.utc,
    )
    dtend = MagicMock()
    dtend.dt = datetime(
        2026, 5, 30, 11, 0, tzinfo=timezone.utc,
    )
    vevent.get = MagicMock(side_effect=lambda k, d=None: {
        "DTSTART": dtstart, "DTEND": dtend,
        "SUMMARY": "Demo event", "UID": "ev1@srv",
    }.get(k, d))

    result = MagicMock()
    result.url = "https://srv/cal/work/ev1.ics"
    ical = MagicMock()
    ical.walk = MagicMock(return_value=[vevent])
    result.icalendar_instance = ical

    cal = MagicMock()
    cal.url = "https://srv/cal/work/"
    cal.name = "Work"
    cal.get_properties.return_value = {}
    cal.search.return_value = [result]

    principal = MagicMock()
    principal.url = "https://srv/principals/me/"
    principal.calendars.return_value = [cal]

    monkeypatch.setattr(
        svc, "_principal",
        lambda url, user, pw: principal,
    )
    return principal


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from kaisho.api.app import app
    return TestClient(app, raise_server_exceptions=False)


# -- Endpoint tests --------------------------------------------------


class TestPresets:
    def test_returns_all_presets(self, client):
        r = client.get("/api/caldav/presets")
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()["presets"]]
        assert set(ids) == {
            "icloud", "fastmail", "nextcloud", "custom",
        }


class TestAccounts:
    def test_list_empty(self, client):
        r = client.get("/api/caldav/accounts")
        assert r.status_code == 200
        assert r.json() == {"accounts": []}

    def test_add_then_list_then_remove(
        self, client, fake_keyring, fake_principal,
    ):
        body = {
            "preset": "fastmail",
            "username": "me@fastmail.com",
            "password": "pw",
        }
        r = client.post("/api/caldav/accounts", json=body)
        assert r.status_code == 200, r.text
        rec = r.json()["account"]
        assert rec["preset"] == "fastmail"

        r = client.get("/api/caldav/accounts")
        assert len(r.json()["accounts"]) == 1

        r = client.delete(
            f"/api/caldav/accounts/{rec['id']}",
        )
        assert r.status_code == 200

        r = client.get("/api/caldav/accounts")
        assert r.json() == {"accounts": []}

    def test_remove_unknown_returns_404(self, client):
        r = client.delete("/api/caldav/accounts/ac_nope")
        assert r.status_code == 404

    def test_add_with_bad_preset_returns_400(
        self, client, fake_keyring, fake_principal,
    ):
        r = client.post(
            "/api/caldav/accounts",
            json={
                "preset": "garbage",
                "username": "u", "password": "p",
            },
        )
        assert r.status_code == 400


class TestTestConnection:
    def test_ok(self, client, fake_principal):
        r = client.post(
            "/api/caldav/test-connection",
            json={
                "preset": "fastmail",
                "username": "me@fastmail.com",
                "password": "pw",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["calendar_count"] == 1

    def test_missing_username_returns_400(self, client):
        r = client.post(
            "/api/caldav/test-connection",
            json={
                "preset": "fastmail",
                "username": "",
                "password": "pw",
            },
        )
        assert r.status_code == 400


class TestEvents:
    def test_list_events_window(
        self, client, fake_keyring, fake_principal,
    ):
        client.post(
            "/api/caldav/accounts",
            json={
                "preset": "fastmail",
                "username": "me@fastmail.com",
                "password": "pw",
            },
        )
        r = client.get(
            "/api/caldav/events",
            params={
                "from": "2026-05-30T00:00:00",
                "to": "2026-05-30T23:59:00",
            },
        )
        assert r.status_code == 200, r.text
        events = r.json()["events"]
        assert len(events) == 1
        assert events[0]["title"] == "Demo event"
        assert events[0]["source"] == "caldav"

    def test_bad_from_returns_400(self, client):
        r = client.get(
            "/api/caldav/events",
            params={
                "from": "garbage", "to": "2026-05-30",
            },
        )
        assert r.status_code == 400

    def test_window_too_wide_returns_400(
        self, client, fake_keyring, fake_principal,
    ):
        client.post(
            "/api/caldav/accounts",
            json={
                "preset": "fastmail",
                "username": "me@fastmail.com",
                "password": "pw",
            },
        )
        r = client.get(
            "/api/caldav/events",
            params={
                "from": "2026-01-01T00:00:00",
                "to": "2026-12-31T00:00:00",
            },
        )
        assert r.status_code == 400


class TestRefresh:
    def test_refresh_returns_dropped_count(
        self, client, fake_keyring, fake_principal,
    ):
        r = client.post("/api/caldav/accounts", json={
            "preset": "fastmail",
            "username": "me@fastmail.com",
            "password": "pw",
        })
        account_id = r.json()["account"]["id"]
        # Populate cache.
        client.get(
            "/api/caldav/events",
            params={
                "from": "2026-05-30T00:00:00",
                "to": "2026-05-30T23:59:00",
            },
        )
        r = client.post(
            f"/api/caldav/accounts/{account_id}/refresh",
        )
        assert r.status_code == 200
        assert r.json()["cache_entries_dropped"] >= 1
