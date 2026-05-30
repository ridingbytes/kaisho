"""Tests for the CalDAV service layer.

The ``caldav`` library is mocked end-to-end so the tests
run offline. Real-server smoke is done manually via
``kai caldav test``.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest


@pytest.fixture
def isolated_profile(tmp_path, monkeypatch):
    """Point KAISHO_HOME at an empty tmp dir and reset
    the cached config so caldav.yaml lands in tmp_path."""
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
    """Replace the keyring backend with an in-memory dict
    so add_account doesn't touch the macOS keychain."""
    store = {}

    def fake_set(service, account, password):
        store[(service, account)] = password

    def fake_get(service, account):
        return store.get((service, account))

    def fake_delete(service, account):
        store.pop((service, account), None)

    import keyring
    monkeypatch.setattr(keyring, "set_password", fake_set)
    monkeypatch.setattr(keyring, "get_password", fake_get)
    monkeypatch.setattr(
        keyring, "delete_password", fake_delete,
    )
    return store


@pytest.fixture
def fake_principal(monkeypatch):
    """Patch ``_principal`` to return a stub with one
    calendar that yields two events on search."""
    from kaisho.services import caldav as svc

    cal = MagicMock()
    cal.url = "https://srv/cal/work/"
    cal.name = "Work"
    cal.get_properties.return_value = {}

    event1 = _fake_caldav_search_result(
        url="https://srv/cal/work/ev1.ics",
        uid="ev1@srv", title="Morning standup",
        start=datetime(2026, 5, 30, 9, 0, tzinfo=timezone.utc),
        end=datetime(2026, 5, 30, 9, 30, tzinfo=timezone.utc),
    )
    event2 = _fake_caldav_search_result(
        url="https://srv/cal/work/ev2.ics",
        uid="ev2@srv", title="Lunch",
        start=datetime(2026, 5, 30, 12, 0, tzinfo=timezone.utc),
        end=datetime(2026, 5, 30, 13, 0, tzinfo=timezone.utc),
    )
    cal.search.return_value = [event1, event2]

    principal = MagicMock()
    principal.url = "https://srv/principals/me/"
    principal.calendars.return_value = [cal]

    monkeypatch.setattr(
        svc, "_principal",
        lambda url, user, pw: principal,
    )
    return principal


def _fake_caldav_search_result(url, uid, title, start, end):
    """Build a minimal MagicMock result whose
    icalendar_instance.walk('VEVENT') yields a stub VEVENT.
    """
    vevent = MagicMock()
    dtstart = MagicMock()
    dtstart.dt = start
    dtend = MagicMock()
    dtend.dt = end

    def get(prop, default=None):
        return {
            "DTSTART": dtstart,
            "DTEND": dtend,
            "SUMMARY": title,
            "UID": uid,
            "LOCATION": None,
            "STATUS": None,
            "DESCRIPTION": None,
            "ORGANIZER": None,
        }.get(prop, default)

    vevent.get = MagicMock(side_effect=get)

    ical = MagicMock()
    ical.walk = MagicMock(return_value=[vevent])
    result = MagicMock()
    result.url = url
    result.icalendar_instance = ical
    return result


def test_add_and_remove_account(
    isolated_profile, fake_keyring, fake_principal,
):
    from kaisho.services import caldav as svc
    rec = svc.add_account(
        preset="fastmail",
        username="me@fastmail.com",
        password="pw",
    )
    assert rec["preset"] == "fastmail"
    assert rec["storage"] == "keyring"
    assert rec["id"].startswith("ac_")

    assert len(svc.list_accounts()) == 1
    assert svc.get_account(rec["id"]) == rec
    assert (
        fake_keyring.get((svc.KEYRING_SERVICE, rec["id"]))
        == "pw"
    )

    assert svc.remove_account(rec["id"]) is True
    assert svc.list_accounts() == []
    assert (
        fake_keyring.get((svc.KEYRING_SERVICE, rec["id"]))
        is None
    )


def test_remove_unknown_account_returns_false(
    isolated_profile, fake_keyring, fake_principal,
):
    from kaisho.services import caldav as svc
    assert svc.remove_account("ac_nope") is False


def test_test_connection_returns_calendar_count(
    isolated_profile, fake_keyring, fake_principal,
):
    from kaisho.services import caldav as svc
    info = svc.test_connection(
        "https://srv/", "me", "pw",
    )
    assert info == {
        "ok": True,
        "principal_url": "https://srv/principals/me/",
        "calendar_count": 1,
    }


def test_list_events_returns_sorted_events(
    isolated_profile, fake_keyring, fake_principal,
):
    from kaisho.services import caldav as svc
    rec = svc.add_account(
        preset="fastmail", username="me@fastmail.com",
        password="pw",
    )
    frm = datetime(2026, 5, 30, 0, 0, tzinfo=timezone.utc)
    to = datetime(2026, 5, 30, 23, 59, tzinfo=timezone.utc)

    events = svc.list_events(frm=frm, to=to)
    assert len(events) == 2
    assert events[0]["title"] == "Morning standup"
    assert events[1]["title"] == "Lunch"
    assert events[0]["start"] < events[1]["start"]
    assert events[0]["account_id"] == rec["id"]
    assert events[0]["source"] == "caldav"


def test_list_events_window_cap(
    isolated_profile, fake_keyring, fake_principal,
):
    from kaisho.services import caldav as svc
    frm = datetime(2026, 1, 1, tzinfo=timezone.utc)
    to = frm + timedelta(days=svc.MAX_WINDOW_DAYS + 1)
    with pytest.raises(svc.CalDavError, match="window"):
        svc.list_events(frm=frm, to=to)


def test_cache_serves_repeated_queries(
    isolated_profile, fake_keyring, fake_principal,
):
    from kaisho.services import caldav as svc
    rec = svc.add_account(
        preset="fastmail", username="me@fastmail.com",
        password="pw",
    )
    frm = datetime(2026, 5, 30, 0, 0, tzinfo=timezone.utc)
    to = datetime(2026, 5, 30, 23, 59, tzinfo=timezone.utc)

    svc.list_events(frm=frm, to=to)
    call_count_after_first = (
        fake_principal.calendars.call_count
    )
    svc.list_events(frm=frm, to=to)
    assert (
        fake_principal.calendars.call_count
        == call_count_after_first
    ), "second call should hit cache"

    svc.refresh_account(rec["id"])
    svc.list_events(frm=frm, to=to)
    assert (
        fake_principal.calendars.call_count
        > call_count_after_first
    ), "refresh should bust cache"


def test_set_enabled_calendars_filters_results(
    isolated_profile, fake_keyring, fake_principal,
):
    from kaisho.services import caldav as svc
    rec = svc.add_account(
        preset="fastmail", username="me@fastmail.com",
        password="pw",
    )
    # Enable a calendar that the fake principal does not
    # expose -- result should be empty (filtered out).
    svc.set_enabled_calendars(
        rec["id"], ["https://srv/cal/personal/"],
    )
    frm = datetime(2026, 5, 30, tzinfo=timezone.utc)
    to = datetime(2026, 5, 31, tzinfo=timezone.utc)
    assert svc.list_events(frm=frm, to=to) == []


def test_event_id_roundtrip(
    isolated_profile, fake_keyring, fake_principal,
):
    from kaisho.services import caldav as svc
    rec = svc.add_account(
        preset="fastmail", username="me@fastmail.com",
        password="pw",
    )
    frm = datetime(2026, 5, 30, tzinfo=timezone.utc)
    to = datetime(2026, 5, 31, tzinfo=timezone.utc)
    events = svc.list_events(frm=frm, to=to)
    ev = events[0]
    account_id, event_url, uid = svc._decode_event_id(
        ev["id"],
    )
    assert account_id == rec["id"]
    assert event_url == "https://srv/cal/work/ev1.ics"
    assert uid == "ev1@srv"


def test_decode_invalid_event_id_raises(
    isolated_profile, fake_keyring, fake_principal,
):
    from kaisho.services import caldav as svc
    with pytest.raises(svc.CalDavError):
        svc._decode_event_id("not-base64-at-all!!!")


def test_has_any_account_false_then_true(
    isolated_profile, fake_keyring, fake_principal,
):
    from kaisho.services import caldav as svc
    assert svc.has_any_account() is False
    svc.add_account(
        preset="fastmail", username="me@fastmail.com",
        password="pw",
    )
    assert svc.has_any_account() is True


def test_keyring_fallback_when_no_backend(
    isolated_profile, monkeypatch, fake_principal,
):
    """If keyring throws NoKeyringError, the password
    lands in the encrypted-file fallback and the account
    record records storage='fallback'."""
    from kaisho.services import caldav as svc
    from keyring.errors import NoKeyringError
    import keyring

    def boom_set(*_a, **_kw):
        raise NoKeyringError("no backend")

    def boom_get(*_a, **_kw):
        raise NoKeyringError("no backend")

    monkeypatch.setattr(keyring, "set_password", boom_set)
    monkeypatch.setattr(keyring, "get_password", boom_get)

    rec = svc.add_account(
        preset="fastmail", username="me@fastmail.com",
        password="pw-secret",
    )
    assert rec["storage"] == "fallback"
    # The password should be retrievable via the fallback.
    assert svc._get_password(rec["id"]) == "pw-secret"
