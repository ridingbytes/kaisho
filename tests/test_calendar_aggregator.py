"""Tests for the calendar aggregator (service + router).

CalDAV and Google fetchers are both mocked so the suite
runs offline.
"""
from datetime import datetime, timezone

import pytest


# -- Fixtures --------------------------------------------------------


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


# -- Service-level tests ---------------------------------------------


class TestListSources:
    def test_no_caldav_no_google(self, monkeypatch):
        from kaisho.services import calendar_aggregator
        from kaisho.services import (
            caldav as caldav_svc, integration_tools,
        )
        monkeypatch.setattr(
            caldav_svc, "has_any_account", lambda: False,
        )
        monkeypatch.setattr(
            caldav_svc, "list_accounts", lambda: [],
        )
        monkeypatch.setattr(
            integration_tools, "connected_kinds",
            lambda: [],
        )
        sources = calendar_aggregator.list_sources()
        assert {s["id"] for s in sources} == {
            "caldav", "google",
        }
        assert all(s["connected"] is False for s in sources)

    def test_caldav_connected_google_not(self, monkeypatch):
        from kaisho.services import calendar_aggregator
        from kaisho.services import (
            caldav as caldav_svc, integration_tools,
        )
        monkeypatch.setattr(
            caldav_svc, "has_any_account", lambda: True,
        )
        monkeypatch.setattr(
            caldav_svc, "list_accounts",
            lambda: [{"id": "ac_1"}],
        )
        monkeypatch.setattr(
            integration_tools, "connected_kinds",
            lambda: [],
        )
        sources = calendar_aggregator.list_sources()
        by_id = {s["id"]: s for s in sources}
        assert by_id["caldav"]["connected"] is True
        assert by_id["caldav"]["account_count"] == 1
        assert by_id["google"]["connected"] is False


class TestListEvents:
    def test_merges_caldav_and_google_sorted(
        self, monkeypatch,
    ):
        from kaisho.services import calendar_aggregator
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
                "title": "CalDAV evt",
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
                "id": "g1", "summary": "Google evt",
                "start": {
                    "dateTime": "2026-05-30T09:00:00Z",
                },
                "end": {
                    "dateTime": "2026-05-30T10:00:00Z",
                },
            }]},
        )

        result = calendar_aggregator.list_events(
            frm=datetime(2026, 5, 30, tzinfo=timezone.utc),
            to=datetime(2026, 5, 31, tzinfo=timezone.utc),
        )
        events = result["events"]
        # CalDAV is 10:00+02:00 = 08:00 UTC; Google is
        # 09:00Z. Real-instant order is CalDAV first.
        # See review C2 -- the old test relied on
        # lexicographic ISO comparison which silently
        # disagreed with chronological order.
        assert [e["title"] for e in events] == [
            "CalDAV evt", "Google evt",
        ], "events should be sorted by real instant"

        sources = {s["id"]: s for s in result["sources"]}
        assert sources["caldav"]["ok"] is True
        assert sources["caldav"]["count"] == 1
        assert sources["google"]["ok"] is True
        assert sources["google"]["count"] == 1

    def test_caldav_failure_does_not_break_google(
        self, monkeypatch,
    ):
        from kaisho.services import calendar_aggregator
        from kaisho.services import (
            caldav as caldav_svc, integration_tools,
        )

        def boom(**_):
            raise caldav_svc.CalDavError("network down")

        monkeypatch.setattr(
            caldav_svc, "has_any_account", lambda: True,
        )
        monkeypatch.setattr(
            caldav_svc, "list_events", boom,
        )
        monkeypatch.setattr(
            integration_tools, "connected_kinds",
            lambda: ["google"],
        )
        monkeypatch.setattr(
            integration_tools, "dispatch_integration_tool",
            lambda *_a, **_kw: {"result": [{
                "id": "g1", "summary": "G",
                "start": {"dateTime": "10:00"},
                "end": {"dateTime": "11:00"},
            }]},
        )

        result = calendar_aggregator.list_events(
            frm=datetime(2026, 5, 30, tzinfo=timezone.utc),
            to=datetime(2026, 5, 31, tzinfo=timezone.utc),
        )
        assert len(result["events"]) == 1
        sources = {s["id"]: s for s in result["sources"]}
        assert sources["caldav"]["ok"] is False
        assert "network down" in sources["caldav"]["error"]
        assert sources["google"]["ok"] is True

    def test_google_disconnected_yields_zero(
        self, monkeypatch,
    ):
        from kaisho.services import calendar_aggregator
        from kaisho.services import (
            caldav as caldav_svc, integration_tools,
        )
        monkeypatch.setattr(
            caldav_svc, "has_any_account", lambda: False,
        )
        monkeypatch.setattr(
            integration_tools, "connected_kinds",
            lambda: [],
        )

        result = calendar_aggregator.list_events(
            frm=datetime(2026, 5, 30, tzinfo=timezone.utc),
            to=datetime(2026, 5, 31, tzinfo=timezone.utc),
        )
        assert result["events"] == []
        assert all(
            s["ok"] and s["count"] == 0
            for s in result["sources"]
        )

    def test_sources_filter_restricts_fanout(
        self, monkeypatch,
    ):
        from kaisho.services import calendar_aggregator
        from kaisho.services import (
            caldav as caldav_svc, integration_tools,
        )
        caldav_called = {"v": False}

        def fake_list(**_):
            caldav_called["v"] = True
            return []

        monkeypatch.setattr(
            caldav_svc, "has_any_account", lambda: True,
        )
        monkeypatch.setattr(
            caldav_svc, "list_events", fake_list,
        )
        monkeypatch.setattr(
            integration_tools, "connected_kinds",
            lambda: [],
        )

        calendar_aggregator.list_events(
            frm=datetime(2026, 5, 30, tzinfo=timezone.utc),
            to=datetime(2026, 5, 31, tzinfo=timezone.utc),
            sources={"google"},
        )
        assert caldav_called["v"] is False, (
            "caldav should be skipped when not in sources"
        )

    def test_limit_applied_after_merge(self, monkeypatch):
        from kaisho.services import calendar_aggregator
        from kaisho.services import (
            caldav as caldav_svc, integration_tools,
        )
        monkeypatch.setattr(
            caldav_svc, "has_any_account", lambda: True,
        )
        monkeypatch.setattr(
            caldav_svc, "list_events",
            lambda **_: [
                {"id": f"c{i}", "source": "caldav",
                 "title": f"c{i}", "start": f"{i:02}:00",
                 "end": f"{i:02}:30"}
                for i in range(10, 15)
            ],
        )
        monkeypatch.setattr(
            integration_tools, "connected_kinds",
            lambda: [],
        )

        result = calendar_aggregator.list_events(
            frm=datetime(2026, 5, 30, tzinfo=timezone.utc),
            to=datetime(2026, 5, 31, tzinfo=timezone.utc),
            limit=3,
        )
        assert len(result["events"]) == 3


class TestGoogleNormalization:
    def test_datetime_event_not_all_day(self):
        from kaisho.services.calendar_aggregator import (
            _normalize_google_event,
        )
        ev = _normalize_google_event({
            "id": "g1", "summary": "Meeting",
            "start": {"dateTime": "2026-05-30T10:00:00Z"},
            "end": {"dateTime": "2026-05-30T11:00:00Z"},
        })
        assert ev["all_day"] is False
        assert ev["title"] == "Meeting"
        assert ev["source"] == "google"
        assert ev["id"].startswith("google:")

    def test_date_only_event_is_all_day(self):
        from kaisho.services.calendar_aggregator import (
            _normalize_google_event,
        )
        ev = _normalize_google_event({
            "id": "g2", "summary": "Holiday",
            "start": {"date": "2026-05-30"},
            "end": {"date": "2026-05-31"},
        })
        assert ev["all_day"] is True

    def test_missing_summary_yields_empty_title(self):
        from kaisho.services.calendar_aggregator import (
            _normalize_google_event,
        )
        ev = _normalize_google_event({
            "id": "g3",
            "start": {"dateTime": "2026-05-30T10:00:00Z"},
            "end": {"dateTime": "2026-05-30T11:00:00Z"},
        })
        assert ev["title"] == ""


# -- Router-level tests ----------------------------------------------


class TestRouterSources:
    def test_returns_both_sources(self, client, monkeypatch):
        from kaisho.services import (
            caldav as caldav_svc, integration_tools,
        )
        monkeypatch.setattr(
            caldav_svc, "has_any_account", lambda: False,
        )
        monkeypatch.setattr(
            caldav_svc, "list_accounts", lambda: [],
        )
        monkeypatch.setattr(
            integration_tools, "connected_kinds",
            lambda: [],
        )
        r = client.get("/api/calendar/sources")
        assert r.status_code == 200
        body = r.json()
        assert {s["id"] for s in body["sources"]} == {
            "caldav", "google",
        }


class TestRouterEvents:
    def test_bad_from_returns_400(self, client):
        r = client.get(
            "/api/calendar/events",
            params={"from": "garbage", "to": "2026-05-30"},
        )
        assert r.status_code == 400

    def test_happy_path(self, client, monkeypatch):
        from kaisho.services import (
            caldav as caldav_svc, integration_tools,
        )
        monkeypatch.setattr(
            caldav_svc, "has_any_account", lambda: True,
        )
        monkeypatch.setattr(
            caldav_svc, "list_events",
            lambda **_: [{
                "id": "x", "source": "caldav",
                "title": "X", "start": "10:00",
                "end": "11:00",
            }],
        )
        monkeypatch.setattr(
            integration_tools, "connected_kinds",
            lambda: [],
        )

        r = client.get(
            "/api/calendar/events",
            params={
                "from": "2026-05-30T00:00:00",
                "to": "2026-05-30T23:59:00",
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert len(body["events"]) == 1
        assert body["events"][0]["title"] == "X"

    def test_source_filter_param(self, client, monkeypatch):
        from kaisho.services import (
            caldav as caldav_svc, integration_tools,
        )
        called = {"caldav": False, "google": False}

        def cd_list(**_):
            called["caldav"] = True
            return []

        def disp(*_a, **_kw):
            called["google"] = True
            return {"result": []}

        monkeypatch.setattr(
            caldav_svc, "has_any_account", lambda: True,
        )
        monkeypatch.setattr(
            caldav_svc, "list_events", cd_list,
        )
        monkeypatch.setattr(
            integration_tools, "connected_kinds",
            lambda: ["google"],
        )
        monkeypatch.setattr(
            integration_tools, "dispatch_integration_tool",
            disp,
        )

        r = client.get(
            "/api/calendar/events",
            params={
                "from": "2026-05-30T00:00:00",
                "to": "2026-05-30T23:59:00",
                "source": "google",
            },
        )
        assert r.status_code == 200
        assert called["caldav"] is False
        assert called["google"] is True
