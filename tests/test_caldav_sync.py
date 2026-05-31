"""Tests for the CalDAV sync engine (Phase 1.5 PR 3).

Mocks the caldav service so the suite stays offline; the
real round-trip is covered by ``kai caldav push-sync``
against a live account.
"""
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
def fake_caldav(monkeypatch):
    """Mock the caldav service surface the sync engine
    talks to. Records every create / update / delete so
    tests can assert on the call sequence."""
    from kaisho.services import caldav as cv
    from kaisho.services import caldav_sync

    state = {
        "accounts": [],
        "creates": [],
        "updates": [],
        "deletes": [],
        "fail_create": False,
        "fail_update": False,
        "fail_delete": False,
    }

    def fake_push_enabled_accounts():
        return list(state["accounts"])

    def fake_create_event(
        *, account_id, calendar_id, summary, start, end,
        description=None, uid=None, categories=None,
    ):
        if state["fail_create"]:
            raise cv.CalDavError("create boom")
        url = (
            f"https://srv/{calendar_id}/"
            f"ev-{len(state['creates'])}.ics"
        )
        state["creates"].append({
            "account_id": account_id,
            "calendar_id": calendar_id,
            "summary": summary,
            "start": start,
            "end": end,
            "uid": uid,
            "url": url,
        })
        return {
            "event_url": url, "etag": '"new"', "uid": uid,
        }

    def fake_update_event(
        *, account_id, event_url, summary, start, end,
        description=None, categories=None,
    ):
        if state["fail_update"]:
            raise cv.CalDavError("update boom")
        state["updates"].append({
            "account_id": account_id,
            "event_url": event_url,
            "summary": summary,
        })
        return {
            "event_url": event_url, "etag": '"upd"',
            "uid": "u",
        }

    def fake_delete_event(account_id, event_url):
        if state["fail_delete"]:
            raise cv.CalDavError("delete boom")
        state["deletes"].append({
            "account_id": account_id,
            "event_url": event_url,
        })

    monkeypatch.setattr(
        cv, "push_enabled_accounts",
        fake_push_enabled_accounts,
    )
    monkeypatch.setattr(
        cv, "create_event", fake_create_event,
    )
    monkeypatch.setattr(
        cv, "update_event", fake_update_event,
    )
    monkeypatch.setattr(
        cv, "delete_event", fake_delete_event,
    )
    # Reset module state between tests.
    caldav_sync._push_lock = __import__(
        "threading",
    ).Lock()
    return state


@pytest.fixture
def fake_backend(monkeypatch):
    """Mock get_backend().clocks.list_entries() to feed
    deterministic entries into the sync engine."""
    state = {"entries": []}

    def fake_get_backend():
        b = MagicMock()
        b.clocks.list_entries.return_value = list(
            state["entries"],
        )
        return b

    from kaisho import backends
    monkeypatch.setattr(
        backends, "get_backend", fake_get_backend,
    )
    return state


def _entry(
    sync_id, start, end, *,
    customer="", description="work",
    updated_at=None, deleted=False,
):
    return {
        "sync_id": sync_id,
        "start_at": start,
        "end_at": end,
        "customer": customer,
        "description": description,
        "updated_at": (
            updated_at or "2026-05-31T10:00:00+00:00"
        ),
        "deleted_at": (
            "2026-05-31T11:00:00+00:00" if deleted else None
        ),
    }


def _account(
    account_id="ac_a", calendar_id="cal-a",
    enabled_since="2026-01-01T00:00:00+00:00",
):
    return {
        "account_id": account_id,
        "calendar_id": calendar_id,
        "enabled_since": enabled_since,
    }


# -- Tests -----------------------------------------------------------


class TestSyncNow:
    def test_no_accounts_is_noop(
        self, isolated_profile, fake_caldav,
        fake_backend,
    ):
        from kaisho.services import caldav_sync
        # accounts intentionally empty.
        summary = caldav_sync.sync_now()
        assert summary["created"] == 0
        assert fake_caldav["creates"] == []

    def test_new_entry_becomes_create(
        self, isolated_profile, fake_caldav,
        fake_backend,
    ):
        from kaisho.services import caldav_sync
        fake_caldav["accounts"] = [_account()]
        fake_backend["entries"] = [
            _entry(
                "abc",
                "2026-05-31T10:00:00+00:00",
                "2026-05-31T11:00:00+00:00",
                customer="Acme",
                description="kickoff",
            ),
        ]
        summary = caldav_sync.sync_now()
        assert summary["created"] == 1
        assert summary["updated"] == 0
        assert summary["errors"] == 0
        created = fake_caldav["creates"][0]
        assert created["summary"] == "[Acme] kickoff"
        assert created["uid"] == "kaisho-abc"

    def test_known_entry_becomes_update(
        self, isolated_profile, fake_caldav,
        fake_backend,
    ):
        from kaisho.services import caldav_sync
        fake_caldav["accounts"] = [_account()]
        fake_backend["entries"] = [
            _entry(
                "abc",
                "2026-05-31T10:00:00+00:00",
                "2026-05-31T11:00:00+00:00",
                description="first",
            ),
        ]
        caldav_sync.sync_now()
        fake_backend["entries"][0]["description"] = "second"
        fake_backend["entries"][0]["updated_at"] = (
            "2026-05-31T12:00:00+00:00"
        )
        summary = caldav_sync.sync_now()
        assert summary["updated"] == 1
        assert summary["created"] == 0
        assert fake_caldav["updates"][0]["summary"] == "second"

    def test_running_timer_skipped(
        self, isolated_profile, fake_caldav,
        fake_backend,
    ):
        from kaisho.services import caldav_sync
        fake_caldav["accounts"] = [_account()]
        fake_backend["entries"] = [{
            "sync_id": "running",
            "start_at": "2026-05-31T10:00:00+00:00",
            "end_at": None,
            "description": "in progress",
            "updated_at": "2026-05-31T10:00:00+00:00",
            "deleted_at": None,
        }]
        summary = caldav_sync.sync_now()
        assert summary["created"] == 0
        assert summary["skipped"] >= 1
        assert fake_caldav["creates"] == []

    def test_entry_older_than_enabled_since_skipped(
        self, isolated_profile, fake_caldav,
        fake_backend,
    ):
        from kaisho.services import caldav_sync
        fake_caldav["accounts"] = [_account(
            enabled_since="2026-05-31T00:00:00+00:00",
        )]
        fake_backend["entries"] = [
            _entry(
                "old",
                "2026-04-01T10:00:00+00:00",
                "2026-04-01T11:00:00+00:00",
                updated_at="2026-04-01T11:00:00+00:00",
            ),
        ]
        summary = caldav_sync.sync_now()
        assert summary["created"] == 0
        assert summary["skipped"] >= 1

    def test_failed_create_records_error(
        self, isolated_profile, fake_caldav,
        fake_backend,
    ):
        from kaisho.services import caldav_sync
        fake_caldav["accounts"] = [_account()]
        fake_caldav["fail_create"] = True
        fake_backend["entries"] = [
            _entry(
                "x",
                "2026-05-31T10:00:00+00:00",
                "2026-05-31T11:00:00+00:00",
            ),
        ]
        summary = caldav_sync.sync_now()
        assert summary["errors"] == 1
        health = caldav_sync.get_account_health("ac_a")
        assert health is not None
        assert health["failure_count"] == 1

    def test_account_marked_degraded_after_threshold(
        self, isolated_profile, fake_caldav,
        fake_backend,
    ):
        from kaisho.services import caldav_sync
        fake_caldav["accounts"] = [_account()]
        fake_caldav["fail_create"] = True
        fake_backend["entries"] = [
            _entry(
                f"x{i}",
                "2026-05-31T10:00:00+00:00",
                "2026-05-31T11:00:00+00:00",
            )
            for i in range(
                caldav_sync.ACCOUNT_FAILURE_THRESHOLD,
            )
        ]
        caldav_sync.sync_now()
        health = caldav_sync.get_account_health("ac_a")
        assert health["degraded"] is True


class TestOnLocalDelete:
    def test_unknown_entry_noop(
        self, isolated_profile, fake_caldav,
        fake_backend,
    ):
        from kaisho.services import caldav_sync
        # No state map yet, no event_url stored.
        caldav_sync.on_local_delete(
            {"sync_id": "never-pushed"},
        )
        assert fake_caldav["deletes"] == []

    def test_known_entry_deletes_event(
        self, isolated_profile, fake_caldav,
        fake_backend,
    ):
        from kaisho.services import caldav_sync
        fake_caldav["accounts"] = [_account()]
        fake_backend["entries"] = [
            _entry(
                "doomed",
                "2026-05-31T10:00:00+00:00",
                "2026-05-31T11:00:00+00:00",
            ),
        ]
        caldav_sync.sync_now()
        assert len(fake_caldav["creates"]) == 1

        caldav_sync.on_local_delete(
            {"sync_id": "doomed"},
        )
        assert len(fake_caldav["deletes"]) == 1


class TestEntryArgsBuilder:
    def test_no_customer_uses_description(self):
        from kaisho.services.caldav_sync import (
            _entry_to_event_args,
        )
        args = _entry_to_event_args(_entry(
            "x",
            "2026-05-31T10:00:00+00:00",
            "2026-05-31T11:00:00+00:00",
            customer="",
            description="solo task",
        ))
        assert args["summary"] == "solo task"
        assert args["categories"] is None

    def test_blank_description_falls_back_to_placeholder(
        self,
    ):
        from kaisho.services.caldav_sync import (
            _entry_to_event_args,
        )
        args = _entry_to_event_args(_entry(
            "x",
            "2026-05-31T10:00:00+00:00",
            "2026-05-31T11:00:00+00:00",
            customer="",
            description="",
        ))
        assert args["summary"] == "(kaisho)"

    def test_missing_times_returns_none(self):
        from kaisho.services.caldav_sync import (
            _entry_to_event_args,
        )
        args = _entry_to_event_args({
            "sync_id": "x", "start_at": "", "end_at": "",
        })
        assert args is None


class TestScheduleGuards:
    def test_schedule_push_noops_without_accounts(
        self, isolated_profile, fake_caldav, monkeypatch,
    ):
        from kaisho.services import caldav_sync
        called = {"v": False}

        def fake_thread_start(*_a, **_kw):
            called["v"] = True

        monkeypatch.setattr(
            "threading.Thread.start",
            fake_thread_start,
        )
        caldav_sync.schedule_push()
        assert called["v"] is False
