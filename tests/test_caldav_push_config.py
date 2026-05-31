"""Tests for the per-account push config (Phase 1.5 PR 2).

Mocks `_principal` so we never touch a real CalDAV server.
The autocreate path for the dedicated "Kaisho" calendar
is exercised end-to-end against the same fake principal
used by ``test_caldav_write.py``.
"""
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest


@pytest.fixture
def isolated_profile(tmp_path, monkeypatch):
    monkeypatch.setenv("KAISHO_HOME", str(tmp_path))
    monkeypatch.delenv("PROFILE", raising=False)
    from kaisho import config
    config.reset_config()
    from kaisho.services import caldav as svc
    svc._cache.clear()
    yield tmp_path
    svc._cache.clear()
    config.reset_config()


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
    """Principal exposing one writable calendar and
    recording newly-created calendars by name."""
    state = {"calendars": [], "made": []}
    from kaisho.services import caldav as svc

    def make_cal_handle(spec):
        cal = MagicMock()
        cal.url = spec["url"]
        cal.name = spec["name"]
        cal.get_properties.return_value = {}
        return cal

    def principal_factory(url, user, pw):
        principal = MagicMock()
        principal.url = "https://srv/principals/me/"

        def cals():
            return [
                make_cal_handle(s)
                for s in state["calendars"]
            ]

        principal.calendars = cals

        def make_cal(name):
            url = f"https://srv/cal/{name}/"
            state["calendars"].append({
                "url": url, "name": name,
            })
            state["made"].append(name)
            handle = MagicMock()
            handle.url = url
            handle.name = name
            return handle

        principal.make_calendar = make_cal
        return principal

    monkeypatch.setattr(svc, "_principal", principal_factory)
    return state


def _seed_account(svc):
    """Inject an account directly via the settings file,
    bypassing add_account's connection check."""
    aid = "ac_push"
    data = svc._load_settings()
    data["accounts"].append({
        "id": aid, "label": "test", "preset": "fastmail",
        "url": "https://srv/", "username": "u",
        "enabled_calendars": [],
        "created_at": datetime.now(
            timezone.utc,
        ).isoformat(),
        "storage": "keyring",
        "push_enabled": False,
        "push_calendar_id": "",
    })
    svc._save_settings(data)
    import keyring
    keyring.set_password(svc.KEYRING_SERVICE, aid, "pw")
    return aid


# -- Service tests ---------------------------------------------------


class TestGetPushConfig:
    def test_returns_default_for_new_account(
        self, isolated_profile, fake_keyring,
    ):
        from kaisho.services import caldav as svc
        aid = _seed_account(svc)
        assert svc.get_push_config(aid) == {
            "enabled": False, "calendar_id": "",
        }

    def test_returns_none_for_unknown_account(
        self, isolated_profile,
    ):
        from kaisho.services import caldav as svc
        assert svc.get_push_config("ac_nope") is None


class TestSetPushConfig:
    def test_enable_with_empty_calendar_autocreates_kaisho(
        self, isolated_profile, fake_keyring,
        fake_principal,
    ):
        from kaisho.services import caldav as svc
        aid = _seed_account(svc)
        cfg = svc.set_push_config(aid, enabled=True)
        assert cfg["enabled"] is True
        assert cfg["calendar_id"].endswith("/Kaisho/")
        assert "Kaisho" in fake_principal["made"]
        # Persisted across loads.
        again = svc.get_push_config(aid)
        assert again == cfg

    def test_enable_with_explicit_calendar_keeps_it(
        self, isolated_profile, fake_keyring,
        fake_principal,
    ):
        from kaisho.services import caldav as svc
        aid = _seed_account(svc)
        fake_principal["calendars"].append({
            "url": "https://srv/cal/Work/", "name": "Work",
        })
        cfg = svc.set_push_config(
            aid, enabled=True,
            calendar_id="https://srv/cal/Work/",
        )
        assert cfg["calendar_id"] == "https://srv/cal/Work/"
        # No Kaisho calendar should have been created.
        assert "Kaisho" not in fake_principal["made"]

    def test_enable_with_unknown_calendar_id_raises(
        self, isolated_profile, fake_keyring,
        fake_principal,
    ):
        from kaisho.services import caldav as svc
        aid = _seed_account(svc)
        fake_principal["calendars"].append({
            "url": "https://srv/cal/Work/", "name": "Work",
        })
        with pytest.raises(
            svc.CalDavError, match="not on account",
        ):
            svc.set_push_config(
                aid, enabled=True,
                calendar_id="https://other/cal/Stolen/",
            )

    def test_disable_preserves_calendar(
        self, isolated_profile, fake_keyring,
        fake_principal,
    ):
        """Toggle off then on should keep the same
        calendar so the user does not have to re-pick."""
        from kaisho.services import caldav as svc
        aid = _seed_account(svc)
        cfg1 = svc.set_push_config(aid, enabled=True)
        cfg2 = svc.set_push_config(aid, enabled=False)
        assert cfg2["enabled"] is False
        assert cfg2["calendar_id"] == cfg1["calendar_id"]
        # Re-enable -- no autocreate, picks up the
        # preserved value.
        cfg3 = svc.set_push_config(aid, enabled=True)
        assert cfg3["calendar_id"] == cfg1["calendar_id"]

    def test_set_for_unknown_account_raises(
        self, isolated_profile,
    ):
        from kaisho.services import caldav as svc
        with pytest.raises(svc.CalDavError):
            svc.set_push_config(
                "ac_nope", enabled=True,
            )


class TestPushEnabledAccounts:
    def test_returns_only_enabled(
        self, isolated_profile, fake_keyring,
        fake_principal,
    ):
        from kaisho.services import caldav as svc
        a1 = _seed_account(svc)
        # Add a second account, keep it disabled.
        data = svc._load_settings()
        data["accounts"].append({
            "id": "ac_off", "label": "off",
            "preset": "fastmail", "url": "https://x/",
            "username": "u", "enabled_calendars": [],
            "created_at": datetime.now(
                timezone.utc,
            ).isoformat(),
            "storage": "keyring",
            "push_enabled": False,
            "push_calendar_id": "",
        })
        svc._save_settings(data)
        svc.set_push_config(a1, enabled=True)

        out = svc.push_enabled_accounts()
        assert len(out) == 1
        assert out[0]["account_id"] == a1
        assert "Kaisho" in out[0]["calendar_id"]


# -- Router tests ----------------------------------------------------


@pytest.fixture(autouse=True)
def _isolate_env(tmp_path, monkeypatch):
    """Standalone API isolation fixture so the router
    tests below have a clean profile dir + reset
    config singletons between tests."""
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


class TestPushConfigRouter:
    def test_get_unknown_returns_404(self, client):
        r = client.get(
            "/api/caldav/accounts/ac_nope/push-config",
        )
        assert r.status_code == 404

    def test_get_default_for_seeded_account(
        self, client, fake_keyring,
    ):
        from kaisho.services import caldav as svc
        aid = _seed_account(svc)
        r = client.get(
            f"/api/caldav/accounts/{aid}/push-config",
        )
        assert r.status_code == 200
        assert r.json() == {
            "enabled": False, "calendar_id": "",
        }

    def test_post_enable_autocreates_kaisho(
        self, client, fake_keyring, fake_principal,
    ):
        from kaisho.services import caldav as svc
        aid = _seed_account(svc)
        r = client.post(
            f"/api/caldav/accounts/{aid}/push-config",
            json={"enabled": True, "calendar_id": ""},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["enabled"] is True
        assert body["calendar_id"].endswith("/Kaisho/")

    def test_post_enable_bad_calendar_returns_400(
        self, client, fake_keyring, fake_principal,
    ):
        from kaisho.services import caldav as svc
        aid = _seed_account(svc)
        r = client.post(
            f"/api/caldav/accounts/{aid}/push-config",
            json={
                "enabled": True,
                "calendar_id": "https://other/Stolen/",
            },
        )
        assert r.status_code == 400
