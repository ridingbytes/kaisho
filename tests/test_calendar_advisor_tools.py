"""Tests for the calendar advisor tools.

`list_calendar_events` and `get_calendar_event` are the
read-only surface exposed to the advisor. They live in
`cron/tools.py` and delegate to the local CalDAV service.
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


def test_tool_defs_include_calendar_tools():
    from kaisho.cron.tool_defs import TOOL_DEFS
    names = {t["name"] for t in TOOL_DEFS}
    assert "list_calendar_events" in names
    assert "get_calendar_event" in names


def test_handler_table_includes_calendar_tools():
    from kaisho.cron.tools import _HANDLERS
    assert "list_calendar_events" in _HANDLERS
    assert "get_calendar_event" in _HANDLERS


def test_list_calendar_events_account_filter_calls_caldav_only(
    monkeypatch,
):
    """With an explicit account_id, skip the aggregator's
    fan-out: that filter is CalDAV-only by definition."""
    from kaisho.services import caldav as svc

    called = {}

    def fake_list(*, frm, to, account_id, limit):
        called["account_id"] = account_id
        called["limit"] = limit
        return [{"id": "e1", "title": "Standup"}]

    monkeypatch.setattr(svc, "list_events", fake_list)

    from kaisho.cron.tools import _list_calendar_events
    out = _list_calendar_events(
        frm="2026-05-30T00:00:00",
        to="2026-05-30T23:59:00",
        account_id="ac_x",
        limit=5,
    )
    assert out["events"] == [
        {"id": "e1", "title": "Standup"},
    ]
    assert out["sources"] == [{
        "id": "caldav", "ok": True, "count": 1,
    }]
    assert called["account_id"] == "ac_x"
    assert called["limit"] == 5


def test_list_calendar_events_uses_aggregator_by_default(
    monkeypatch,
):
    """Without ``account_id``, fan out via the calendar
    aggregator so the model sees both CalDAV and Google in
    one call. See review S2."""
    from kaisho.services import calendar_aggregator as agg

    captured = {}

    def fake_agg(*, frm, to, limit=None, sources=None):
        captured["frm"] = frm
        captured["to"] = to
        captured["limit"] = limit
        return {"events": ["aggregated"], "sources": []}

    monkeypatch.setattr(agg, "list_events", fake_agg)

    from kaisho.cron.tools import _list_calendar_events
    out = _list_calendar_events()
    assert out == {"events": ["aggregated"], "sources": []}
    # Default window is 7 days snapped to today midnight.
    delta = captured["to"] - captured["frm"]
    assert delta.days == 7
    assert captured["frm"].hour == 0
    assert captured["frm"].minute == 0
    assert captured["frm"].second == 0


def test_list_calendar_events_surfaces_caldav_error(
    monkeypatch,
):
    """When account_id is supplied, CalDAV errors surface
    as ``{"error": ...}`` for the model to read."""
    from kaisho.services import caldav as svc

    def boom(**_):
        raise svc.CalDavError("offline")

    monkeypatch.setattr(svc, "list_events", boom)
    from kaisho.cron.tools import _list_calendar_events
    out = _list_calendar_events(account_id="ac_x")
    assert out == {"error": "offline"}


def test_get_calendar_event_proxies_to_service(monkeypatch):
    from kaisho.services import caldav as svc

    def fake_get(event_id):
        assert event_id == "evt_abc"
        return {"id": "evt_abc", "title": "x"}

    monkeypatch.setattr(svc, "get_event", fake_get)
    from kaisho.cron.tools import _get_calendar_event
    out = _get_calendar_event("evt_abc")
    assert out == {"event": {"id": "evt_abc", "title": "x"}}


def test_get_calendar_event_surfaces_error(monkeypatch):
    from kaisho.services import caldav as svc

    def boom(_):
        raise svc.CalDavError("bad id")

    monkeypatch.setattr(svc, "get_event", boom)
    from kaisho.cron.tools import _get_calendar_event
    out = _get_calendar_event("nope")
    assert out == {"error": "bad id"}
