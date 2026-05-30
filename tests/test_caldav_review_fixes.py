"""Regression tests for the fixes shipped in PR A after
the 2026-05-30 in-depth CalDAV review (#116).

Each test pins a finding so it does not regress: a
descriptive name lets ``pytest -k <id>`` re-run the case
behind a specific finding.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock


# -- C2: aggregator sort with mixed timestamp shapes -----


def test_c2_sort_mixed_utc_offset_and_bare_date():
    """Real-instant chronological order across the shapes
    we get from CalDAV and Google:

    - ``2026-05-30`` (bare date)        -> 00:00Z on 5/30
    - ``2026-05-29T23:30:00-05:00``     -> 04:30Z on 5/30
    - ``2026-05-30T10:00:00+02:00``     -> 08:00Z on 5/30
    - ``2026-05-30T09:00:00Z``          -> 09:00Z on 5/30
    """
    from kaisho.services.calendar_aggregator import _sort_key

    chronological = [
        "2026-05-30",
        "2026-05-29T23:30:00-05:00",
        "2026-05-30T10:00:00+02:00",
        "2026-05-30T09:00:00Z",
    ]
    keys = [_sort_key(s) for s in chronological]
    assert keys == sorted(keys), (
        "_sort_key should produce strictly ascending "
        "keys for chronologically-ordered ISO strings, "
        "got %r" % keys
    )


def test_c2_unparseable_start_sorts_last():
    from kaisho.services.calendar_aggregator import _sort_key

    good = _sort_key("2026-05-30T10:00:00Z")
    bad = _sort_key("not-a-date")
    assert bad > good


def test_c2_aggregator_returns_chronological_order(
    monkeypatch,
):
    from kaisho.services import calendar_aggregator as agg
    from kaisho.services import (
        caldav as caldav_svc, integration_tools,
    )

    monkeypatch.setattr(
        caldav_svc, "has_any_account", lambda: True,
    )
    monkeypatch.setattr(
        caldav_svc, "list_events",
        lambda **_: [{
            "id": "cd1", "source": "caldav",
            "title": "CalDAV 10:00",
            "start": "2026-05-30T10:00:00+02:00",
            "end": "2026-05-30T11:00:00+02:00",
        }],
    )
    monkeypatch.setattr(
        integration_tools, "connected_kinds",
        lambda: ["google"],
    )
    monkeypatch.setattr(
        integration_tools, "dispatch_integration_tool",
        lambda *_a, **_kw: {"result": [{
            "id": "g1", "summary": "Google 09:00 UTC",
            "start": {
                "dateTime": "2026-05-30T09:00:00Z",
            },
            "end": {
                "dateTime": "2026-05-30T10:00:00Z",
            },
        }]},
    )

    out = agg.list_events(
        frm=datetime(2026, 5, 30, tzinfo=timezone.utc),
        to=datetime(2026, 5, 31, tzinfo=timezone.utc),
    )
    # Google 09:00Z = 11:00+02:00, so its real instant is
    # after CalDAV 10:00+02:00. Order must reflect that.
    titles = [e["title"] for e in out["events"]]
    assert titles == ["CalDAV 10:00", "Google 09:00 UTC"]


# -- F6: DURATION fallback when DTEND is missing ---------


def test_f6_vevent_with_duration_only_returns_real_end():
    """An event with DURATION but no DTEND used to render
    as a zero-minute pill. Now we apply the duration to
    DTSTART."""
    from kaisho.services.caldav import _vevent_to_dict

    start_dt = datetime(2026, 5, 30, 10, tzinfo=timezone.utc)
    duration_td = timedelta(minutes=45)

    vevent = MagicMock()

    def get(key, default=None):
        return {
            "DTSTART": _wrap(start_dt),
            "DTEND": None,
            "DURATION": _wrap(duration_td),
            "SUMMARY": "External invite",
            "UID": "uid-duration",
        }.get(key, default)
    vevent.get = MagicMock(side_effect=get)

    result = MagicMock()
    result.url = "https://srv/cal/work/evX.ics"

    out = _vevent_to_dict(
        vevent, "ac_x", "https://srv/cal/work/", result,
    )
    # End should be 45 minutes past start, not equal.
    assert out["start"] != out["end"]
    end_dt = datetime.fromisoformat(out["end"])
    start_iso_dt = datetime.fromisoformat(out["start"])
    assert end_dt - start_iso_dt == timedelta(minutes=45)


def test_f6_vevent_with_no_end_and_no_duration_collapses(
):
    """Pre-existing behaviour: when neither DTEND nor
    DURATION is given the end falls back to the start."""
    from kaisho.services.caldav import _vevent_to_dict

    start_dt = datetime(2026, 5, 30, 10, tzinfo=timezone.utc)
    vevent = MagicMock()

    def get(key, default=None):
        return {
            "DTSTART": _wrap(start_dt),
            "DTEND": None,
            "DURATION": None,
            "SUMMARY": "x", "UID": "uid-x",
        }.get(key, default)
    vevent.get = MagicMock(side_effect=get)

    result = MagicMock()
    result.url = "https://srv/cal/work/ev.ics"

    out = _vevent_to_dict(
        vevent, "ac_x", "https://srv/cal/work/", result,
    )
    assert out["start"] == out["end"]


def _wrap(value):
    """icalendar properties expose their parsed value via
    a ``.dt`` attribute. The service code accesses
    ``.dt`` directly so the test fakes do the same."""
    m = MagicMock()
    m.dt = value
    return m


# -- C3: get_event shares _fetch_event_object with writes -


def test_c3_get_event_does_not_misuse_event_url():
    """get_event used to pass the *event* URL where the
    library expects the *calendar* URL. Now it shares the
    same helper the write path uses. Verify by importing
    the function and confirming it does not contain the
    old anti-pattern."""
    import inspect
    from kaisho.services import caldav as svc
    src = inspect.getsource(svc.get_event)
    assert "_fetch_event_object" in src, (
        "get_event must delegate to _fetch_event_object"
    )
    assert "client.calendar(url=event_url)" not in src, (
        "get_event must not pass event_url as a calendar"
        " URL"
    )


# -- F2: lying docstring removed -------------------------


def test_f2_update_event_docstring_acknowledges_phase15():
    from kaisho.services import caldav as svc
    doc = svc.update_event.__doc__ or ""
    assert "Phase 1.5" in doc or "#117" in doc, (
        "update_event docstring should mention the future"
        " phase that ships the recreate path"
    )
    assert "recreate" not in doc.lower() or (
        "Phase 1.5" in doc
    ), (
        "old text claimed an existing recreate path that"
        " does not exist yet"
    )


# -- L1: advisor default 'from' snaps to midnight --------


def test_l1_advisor_from_default_is_midnight(monkeypatch):
    """Earlier version used datetime.now() so a 14:00
    query silently dropped morning events. Now snaps to
    today 00:00 local."""
    from kaisho.services import calendar_aggregator as agg
    captured = {}

    def fake(**kwargs):
        captured.update(kwargs)
        return {"events": [], "sources": []}

    monkeypatch.setattr(agg, "list_events", fake)
    from kaisho.cron.tools import _list_calendar_events
    _list_calendar_events()
    frm = captured["frm"]
    assert frm.hour == 0
    assert frm.minute == 0
    assert frm.second == 0


# -- S2: advisor uses aggregator (Google included) -------


def test_s2_advisor_fans_out_to_google(monkeypatch):
    """When account_id is not given, the advisor must
    fan out via the aggregator so the model sees Google
    events too."""
    from kaisho.services import calendar_aggregator as agg
    called = {"agg": False}

    def fake(**_):
        called["agg"] = True
        return {"events": [], "sources": []}

    monkeypatch.setattr(agg, "list_events", fake)
    from kaisho.cron.tools import _list_calendar_events
    _list_calendar_events()
    assert called["agg"] is True


# -- C3: round-trip list -> get -------------------------


def test_c3_list_get_roundtrip_returns_same_uid(
    tmp_path, monkeypatch,
):
    """A second guard for C3: list_events then get_event
    on the returned id must surface the same UID."""
    monkeypatch.setenv("KAISHO_HOME", str(tmp_path))
    monkeypatch.delenv("PROFILE", raising=False)
    from kaisho import config
    config.reset_config()
    from kaisho.services import caldav as svc
    svc._cache.clear()

    # In-memory keyring fake.
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

    # Build a fake principal that serves one event.
    target_uid = "uid-roundtrip"

    def make_vevent():
        v = MagicMock()
        v.get = MagicMock(side_effect=lambda k, d=None: {
            "DTSTART": _wrap(datetime(
                2026, 5, 30, 10, tzinfo=timezone.utc,
            )),
            "DTEND": _wrap(datetime(
                2026, 5, 30, 11, tzinfo=timezone.utc,
            )),
            "SUMMARY": "round-trip",
            "UID": target_uid,
            "DESCRIPTION": "d", "ORGANIZER": None,
        }.get(k, d))
        return v

    result = MagicMock()
    result.url = "https://srv/cal/work/rt.ics"
    ical = MagicMock()
    ical.walk = MagicMock(return_value=[make_vevent()])
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

    # Stub the caldav.DAVClient that _fetch_event_object
    # uses to fetch the event by URL.
    class FakeClient:
        def __init__(self, *_a, **_kw): pass

        def calendar(self, url=None):
            handle = MagicMock()

            def by_url(url_in):
                ev = MagicMock()
                ev.url = url_in
                ical_2 = MagicMock()
                ical_2.walk = MagicMock(
                    return_value=[make_vevent()],
                )
                ev.icalendar_instance = ical_2
                return ev
            handle.event_by_url = by_url
            return handle

    monkeypatch.setattr(
        "caldav.DAVClient",
        lambda *a, **k: FakeClient(),
    )

    # Seed an account by writing settings directly.
    aid = "ac_rt"
    data = svc._load_settings()
    data["accounts"].append({
        "id": aid, "label": "rt", "preset": "fastmail",
        "url": "https://srv/", "username": "u",
        "enabled_calendars": [],
        "created_at": "2026-05-30T00:00:00",
        "storage": "keyring",
    })
    svc._save_settings(data)
    keyring.set_password(svc.KEYRING_SERVICE, aid, "pw")

    events = svc.list_events(
        frm=datetime(2026, 5, 30, tzinfo=timezone.utc),
        to=datetime(2026, 5, 31, tzinfo=timezone.utc),
    )
    assert len(events) == 1
    event_id = events[0]["id"]

    fetched = svc.get_event(event_id)
    assert fetched["uid"] == target_uid
