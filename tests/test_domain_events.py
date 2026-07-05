"""Tests for the domain event bus and its wiring into the
task and clock write chokepoints.

Phase 1 of the workflow-automation design
(``product/WORKFLOW-AUTOMATION.md``): the emitter exists
and every task/clock mutation fires a semantic event with
the full entity payload. Delivery (webhooks) is a later
phase and is not exercised here.
"""
import pytest

from kaisho.services import events
from kaisho.services import kanban as kanban_svc
from kaisho.services import clocks as clocks_svc

KEYWORDS = {"TODO", "NEXT", "IN-PROGRESS", "WAIT", "DONE"}


@pytest.fixture
def captured():
    """Subscribe a collector and yield the event list.

    Unsubscribes on teardown so the module-global
    subscriber list never leaks between tests.
    """
    seen: list[dict] = []
    unsubscribe = events.subscribe(seen.append)
    try:
        yield seen
    finally:
        unsubscribe()


# -- Emitter unit behaviour -------------------------------

def test_emit_without_subscribers_is_noop():
    # No subscriber registered: must not raise.
    events.emit(events.TASK_CREATED, {"task": {}})


def test_envelope_shape(captured):
    events.emit(events.TASK_CREATED, {"task": {"id": "1"}})
    assert len(captured) == 1
    evt = captured[0]
    assert evt["event"] == "task.created"
    assert evt["id"].startswith("evt_")
    assert isinstance(evt["profile"], str)
    assert evt["occurred_at"].endswith("Z")
    assert evt["data"] == {"task": {"id": "1"}}


def test_unsubscribe_stops_delivery():
    seen: list[dict] = []
    unsubscribe = events.subscribe(seen.append)
    events.emit(events.TASK_CREATED, {"task": {}})
    unsubscribe()
    events.emit(events.TASK_CREATED, {"task": {}})
    assert len(seen) == 1


def test_failing_subscriber_is_isolated(captured):
    def boom(_event):
        raise RuntimeError("subscriber blew up")

    unsubscribe = events.subscribe(boom)
    try:
        # The failing subscriber must not stop the healthy
        # one nor propagate out of emit.
        events.emit(events.TASK_CREATED, {"task": {}})
    finally:
        unsubscribe()
    assert len(captured) == 1


# -- Task chokepoints -------------------------------------

def test_add_task_emits_created(org_dir, captured):
    todos = org_dir / "todos.org"
    task = kanban_svc.add_task(
        todos, KEYWORDS, "ACME", "Fix login",
    )
    assert len(captured) == 1
    evt = captured[0]
    assert evt["event"] == "task.created"
    assert evt["data"]["task"]["id"] == task["id"]
    assert evt["data"]["task"]["customer"] == "ACME"


def test_move_task_emits_moved_with_delta(
    org_dir, captured,
):
    todos = org_dir / "todos.org"
    task = kanban_svc.add_task(
        todos, KEYWORDS, "ACME", "Move me",
    )
    captured.clear()
    kanban_svc.move_task(
        todos, KEYWORDS, task["id"], "DONE",
    )
    assert len(captured) == 1
    evt = captured[0]
    assert evt["event"] == "task.moved"
    assert evt["data"]["delta"] == {
        "from_state": "TODO",
        "to_state": "DONE",
    }
    assert evt["data"]["task"]["status"] == "DONE"


def test_update_task_delta_only_changed_fields(
    org_dir, captured,
):
    todos = org_dir / "todos.org"
    task = kanban_svc.add_task(
        todos, KEYWORDS, "ACME", "Rename me",
    )
    captured.clear()
    kanban_svc.update_task(
        todos, KEYWORDS, task["id"], title="Renamed",
    )
    assert len(captured) == 1
    evt = captured[0]
    assert evt["event"] == "task.updated"
    # Only the passed field appears in the delta.
    assert evt["data"]["delta"] == {"title": "Renamed"}


def test_set_tags_emits_updated(org_dir, captured):
    todos = org_dir / "todos.org"
    task = kanban_svc.add_task(
        todos, KEYWORDS, "ACME", "Tag me",
    )
    captured.clear()
    kanban_svc.set_task_tags(
        todos, KEYWORDS, task["id"], ["billable", "urgent"],
    )
    assert len(captured) == 1
    evt = captured[0]
    assert evt["event"] == "task.updated"
    assert evt["data"]["delta"] == {
        "tags": ["billable", "urgent"],
    }


def test_archive_task_emits_archived(org_dir, captured):
    todos = org_dir / "todos.org"
    archive = org_dir / "archive.org"
    task = kanban_svc.add_task(
        todos, KEYWORDS, "ACME", "Archive me",
    )
    captured.clear()
    ok = kanban_svc.archive_task(
        todos, archive, KEYWORDS, task["id"],
    )
    assert ok is True
    assert len(captured) == 1
    evt = captured[0]
    assert evt["event"] == "task.archived"
    assert evt["data"]["task"]["id"] == task["id"]


# -- Clock chokepoints ------------------------------------

def test_quick_book_emits_booked(org_dir, captured):
    clocks = org_dir / "clocks.org"
    entry = clocks_svc.quick_book(
        clocks, "1h30m", "ACME", "Worked",
    )
    assert len(captured) == 1
    evt = captured[0]
    assert evt["event"] == "clock.booked"
    assert evt["data"]["entry"]["customer"] == "ACME"
    assert entry["customer"] == "ACME"


def test_timer_start_and_stop_emit(org_dir, captured):
    clocks = org_dir / "clocks.org"
    clocks_svc.start_timer(clocks, "ACME", "Timing")
    clocks_svc.stop_timer(clocks)
    names = [e["event"] for e in captured]
    assert names == [
        "clock.timer_started",
        "clock.timer_stopped",
    ]


def test_update_clock_entry_emits_delta(
    org_dir, captured,
):
    clocks = org_dir / "clocks.org"
    entry = clocks_svc.quick_book(
        clocks, "1h", "ACME", "Worked",
    )
    captured.clear()
    clocks_svc.update_clock_entry(
        clocks, start_iso=entry["start"], invoiced=True,
    )
    assert len(captured) == 1
    evt = captured[0]
    assert evt["event"] == "clock.updated"
    # ``invoiced=True`` survives the None-filter.
    assert evt["data"]["delta"] == {"invoiced": True}


def test_delete_clock_entry_emits_deleted(
    org_dir, captured,
):
    clocks = org_dir / "clocks.org"
    entry = clocks_svc.quick_book(
        clocks, "1h", "ACME", "Worked",
    )
    captured.clear()
    deleted = clocks_svc.delete_clock_entry(
        clocks, entry["start"],
    )
    assert deleted is not None
    assert len(captured) == 1
    assert captured[0]["event"] == "clock.deleted"


# -- Sync-path events (mobile-originated changes) ---------

def _sync_fields(sync_id, updated_at, **over):
    """A minimal cloud sync payload for one clock entry."""
    fields = {
        "sync_id": sync_id,
        "start": "2026-07-05T09:00:00",
        "end": "2026-07-05T10:00:00",
        "customer": "ACME",
        "description": "Synced work",
        "updated_at": updated_at,
        "invoiced": False,
    }
    fields.update(over)
    return fields


def test_insert_from_sync_emits_booked(org_dir, captured):
    clocks = org_dir / "clocks.org"
    clocks_svc.insert_clock_entry_from_sync(
        clocks, _sync_fields("sid-1", "2026-07-05T10:00:00"),
    )
    assert [e["event"] for e in captured] == [
        "clock.booked",
    ]


def test_update_from_sync_emits_updated(org_dir, captured):
    clocks = org_dir / "clocks.org"
    clocks_svc.insert_clock_entry_from_sync(
        clocks, _sync_fields("sid-2", "2026-07-05T10:00:00"),
    )
    captured.clear()
    clocks_svc.update_clock_entry_by_sync_id(
        clocks, "sid-2",
        _sync_fields(
            "sid-2", "2026-07-05T11:00:00",
            description="Edited on mobile",
        ),
    )
    assert [e["event"] for e in captured] == [
        "clock.updated",
    ]


def test_stale_sync_update_emits_nothing(
    org_dir, captured,
):
    clocks = org_dir / "clocks.org"
    clocks_svc.insert_clock_entry_from_sync(
        clocks, _sync_fields("sid-3", "2026-07-05T12:00:00"),
    )
    captured.clear()
    # Older updated_at loses last-writer-wins: no change,
    # so no event.
    clocks_svc.update_clock_entry_by_sync_id(
        clocks, "sid-3",
        _sync_fields("sid-3", "2026-07-05T08:00:00"),
    )
    assert captured == []


def test_delete_from_sync_emits_deleted(org_dir, captured):
    clocks = org_dir / "clocks.org"
    clocks_svc.insert_clock_entry_from_sync(
        clocks, _sync_fields("sid-4", "2026-07-05T10:00:00"),
    )
    captured.clear()
    clocks_svc.delete_clock_entry_by_sync_id(clocks, "sid-4")
    assert [e["event"] for e in captured] == [
        "clock.deleted",
    ]


def test_suppressed_blocks_emission(org_dir, captured):
    clocks = org_dir / "clocks.org"
    with events.suppressed():
        clocks_svc.insert_clock_entry_from_sync(
            clocks,
            _sync_fields("sid-5", "2026-07-05T10:00:00"),
        )
    assert captured == []
    # Emission resumes after the context exits.
    clocks_svc.insert_clock_entry_from_sync(
        clocks, _sync_fields("sid-6", "2026-07-05T10:00:00"),
    )
    assert [e["event"] for e in captured] == [
        "clock.booked",
    ]
