"""Tests for the CalDAV write primitives (Phase 1.5).

Mocks the principal + calendar handles so the suite stays
offline. Real-server smoke goes through
``kai caldav push-test``.
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
def fake_calendars(monkeypatch):
    """Stub principal.calendars() returning a list-like
    handle with a configurable existing-calendars set and
    a recording make_calendar."""
    state = {
        "calendars": [],
        "made": [],
        "events_saved": [],
        "events_deleted": [],
        "fail_save": False,
        "fail_delete": False,
    }
    from kaisho.services import caldav as svc

    def fake_principal(url, user, pw):
        principal = MagicMock()
        principal.url = "https://srv/principals/me/"

        def cals():
            out = []
            for spec in state["calendars"]:
                cal = MagicMock()
                cal.url = spec["url"]
                cal.name = spec["name"]
                cal.get_properties.return_value = {}
                cal.save_event = _saving_save(state, cal)
                out.append(cal)
            return out

        principal.calendars = cals

        def make_cal(name):
            url = f"https://srv/cal/{name}/"
            state["calendars"].append({
                "url": url, "name": name,
            })
            state["made"].append(name)
            cal = MagicMock()
            cal.url = url
            cal.name = name
            return cal

        principal.make_calendar = make_cal
        return principal

    monkeypatch.setattr(svc, "_principal", fake_principal)

    def fake_client_calendar(url):
        cal = MagicMock()
        cal.save_event = _saving_save(state, cal)
        cal.event_by_url = _event_by_url(state, cal)
        return cal

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def calendar(self, url=None):
            return fake_client_calendar(url)

    monkeypatch.setattr(
        "caldav.DAVClient",
        lambda *a, **k: FakeClient(),
    )
    return state


def _saving_save(state, cal):
    def save_event(ical):
        if state["fail_save"]:
            raise RuntimeError("server boom")
        ev = MagicMock()
        ev.url = f"{cal.url}ev-{len(state['events_saved'])}.ics"
        ev.etag = '"abc"'
        ical_inst = MagicMock()
        vevent = MagicMock()
        vevent.get = MagicMock(side_effect=lambda k, d=None: {
            "UID": "uid-abc",
        }.get(k, d))
        ical_inst.walk = MagicMock(return_value=[vevent])
        ev.icalendar_instance = ical_inst
        state["events_saved"].append({
            "url": str(ev.url), "ical": ical,
        })
        return ev
    return save_event


def _event_by_url(state, _cal):
    def by_url(url):
        for saved in state["events_saved"]:
            if saved["url"] == url:
                ev = MagicMock()
                ev.url = url
                ev.etag = '"def"'
                ev.data = saved["ical"]
                vevent = MagicMock()
                vevent.get = MagicMock(
                    side_effect=lambda k, d=None: {
                        "UID": "uid-abc",
                    }.get(k, d),
                )
                ical_inst = MagicMock()
                ical_inst.walk = MagicMock(
                    return_value=[vevent],
                )
                ev.icalendar_instance = ical_inst

                def saver():
                    saved["ical"] = ev.data
                ev.save = saver

                def deleter():
                    if state["fail_delete"]:
                        raise RuntimeError("delete boom")
                    state["events_deleted"].append(url)
                    state["events_saved"].remove(saved)
                ev.delete = deleter
                return ev
        raise RuntimeError(f"missing {url}")
    return by_url


def _seed_account(svc, fake_keyring):
    rec = svc.add_account.__wrapped__ if False else None  # noqa
    # Bypass test_connection by writing settings directly.
    from datetime import datetime, timezone
    aid = "ac_test123"
    data = svc._load_settings()
    data["accounts"].append({
        "id": aid, "label": "test", "preset": "fastmail",
        "url": "https://srv/", "username": "u",
        "enabled_calendars": [], "storage": "keyring",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    svc._save_settings(data)
    import keyring
    keyring.set_password(svc.KEYRING_SERVICE, aid, "pw")
    return aid


# -- Tests ------------------------------------------------------------


def test_ensure_kaisho_creates_if_missing(
    isolated_profile, fake_keyring, fake_calendars,
):
    from kaisho.services import caldav as svc
    aid = _seed_account(svc, fake_keyring)

    cal = svc.ensure_kaisho_calendar(aid)
    assert cal["name"] == "Kaisho"
    assert fake_calendars["made"] == ["Kaisho"]


def test_ensure_kaisho_reuses_existing(
    isolated_profile, fake_keyring, fake_calendars,
):
    from kaisho.services import caldav as svc
    aid = _seed_account(svc, fake_keyring)
    fake_calendars["calendars"].append({
        "url": "https://srv/cal/Kaisho/", "name": "Kaisho",
    })

    cal = svc.ensure_kaisho_calendar(aid)
    assert cal["name"] == "Kaisho"
    assert fake_calendars["made"] == []


def test_create_event_returns_url_uid_etag(
    isolated_profile, fake_keyring, fake_calendars,
):
    from kaisho.services import caldav as svc
    aid = _seed_account(svc, fake_keyring)
    fake_calendars["calendars"].append({
        "url": "https://srv/cal/Kaisho/", "name": "Kaisho",
    })

    out = svc.create_event(
        account_id=aid,
        calendar_id="https://srv/cal/Kaisho/",
        summary="My session",
        start=datetime(2026, 5, 30, 10, tzinfo=timezone.utc),
        end=datetime(2026, 5, 30, 12, tzinfo=timezone.utc),
        description="2h",
        uid="my-uid-1",
    )
    assert out["uid"] == "my-uid-1"
    assert out["event_url"].endswith(".ics")
    assert out["etag"] == '"abc"'
    saved = fake_calendars["events_saved"][0]
    assert "SUMMARY:My session" in saved["ical"]
    assert "UID:my-uid-1" in saved["ical"]


def test_create_event_translates_server_error(
    isolated_profile, fake_keyring, fake_calendars,
):
    from kaisho.services import caldav as svc
    aid = _seed_account(svc, fake_keyring)
    fake_calendars["calendars"].append({
        "url": "https://srv/cal/Kaisho/", "name": "Kaisho",
    })
    fake_calendars["fail_save"] = True

    with pytest.raises(svc.CalDavError, match="create"):
        svc.create_event(
            account_id=aid,
            calendar_id="https://srv/cal/Kaisho/",
            summary="x",
            start=datetime.now(timezone.utc),
            end=datetime.now(timezone.utc),
        )


def test_update_event_preserves_uid(
    isolated_profile, fake_keyring, fake_calendars,
):
    from kaisho.services import caldav as svc
    aid = _seed_account(svc, fake_keyring)
    fake_calendars["calendars"].append({
        "url": "https://srv/cal/Kaisho/", "name": "Kaisho",
    })

    created = svc.create_event(
        account_id=aid,
        calendar_id="https://srv/cal/Kaisho/",
        summary="first",
        start=datetime(2026, 5, 30, 9, tzinfo=timezone.utc),
        end=datetime(2026, 5, 30, 10, tzinfo=timezone.utc),
        uid="reuse-me",
    )

    updated = svc.update_event(
        account_id=aid,
        event_url=created["event_url"],
        summary="second",
        start=datetime(2026, 5, 30, 9, tzinfo=timezone.utc),
        end=datetime(2026, 5, 30, 11, tzinfo=timezone.utc),
    )
    assert updated["uid"] == "uid-abc"
    saved = fake_calendars["events_saved"][0]
    assert "SUMMARY:second" in saved["ical"]


def test_delete_event_is_idempotent(
    isolated_profile, fake_keyring, fake_calendars,
):
    from kaisho.services import caldav as svc
    aid = _seed_account(svc, fake_keyring)
    fake_calendars["calendars"].append({
        "url": "https://srv/cal/Kaisho/", "name": "Kaisho",
    })

    created = svc.create_event(
        account_id=aid,
        calendar_id="https://srv/cal/Kaisho/",
        summary="x",
        start=datetime.now(timezone.utc),
        end=datetime.now(timezone.utc),
    )
    svc.delete_event(aid, created["event_url"])
    assert fake_calendars["events_deleted"] == [
        created["event_url"],
    ]
    # Second delete is a no-op.
    svc.delete_event(aid, created["event_url"])


def test_delete_translates_server_error(
    isolated_profile, fake_keyring, fake_calendars,
):
    from kaisho.services import caldav as svc
    aid = _seed_account(svc, fake_keyring)
    fake_calendars["calendars"].append({
        "url": "https://srv/cal/Kaisho/", "name": "Kaisho",
    })
    created = svc.create_event(
        account_id=aid,
        calendar_id="https://srv/cal/Kaisho/",
        summary="x",
        start=datetime.now(timezone.utc),
        end=datetime.now(timezone.utc),
    )
    fake_calendars["fail_delete"] = True
    with pytest.raises(svc.CalDavError, match="delete"):
        svc.delete_event(aid, created["event_url"])
