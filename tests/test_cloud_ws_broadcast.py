"""Tests for the cloud-WS → frontend refresh broadcast.

The bug fixed in #148: ``entries:changed`` arriving from the
cloud scheduled a background sync but never told the local
React frontend to invalidate its queries, so the row kept
rendering from the existing cache until the app was
restarted.

These tests stub out the actual sync so we exercise only the
event-routing / drain-and-broadcast wiring.
"""
import threading

import pytest

from kaisho.cron import scheduler


@pytest.fixture(autouse=True)
def _reset_pending_state():
    """Clear module-level WS state between tests so order
    doesn't matter."""
    scheduler._ws_pending_resources.clear()
    scheduler._ws_sync_pending = False
    yield
    scheduler._ws_pending_resources.clear()
    scheduler._ws_sync_pending = False


def _capture_broadcasts(monkeypatch):
    """Replace ``broadcast_sync`` with a recorder. Returns
    the captured-messages list."""
    captured = []

    def fake_broadcast(message):
        captured.append(message)

    import kaisho.api.ws.manager as mgr
    monkeypatch.setattr(mgr, "broadcast_sync", fake_broadcast)
    return captured


def test_entries_changed_records_pending_clocks(monkeypatch):
    """``entries:changed`` must accumulate ``clocks`` in the
    pending set so the post-sync drain broadcasts it."""
    # Block _schedule_ws_sync from actually spawning the
    # debounce thread — we test the drain step separately.
    monkeypatch.setattr(
        scheduler, "_schedule_ws_sync", lambda: None,
    )
    scheduler._on_cloud_ws_event("entries:changed", {})
    assert "clocks" in scheduler._ws_pending_resources


def test_timer_started_schedules_sync(monkeypatch):
    """A ``timer:started`` from the cloud (e.g. iPhone
    starting a brand-new timer or resuming a paused entry)
    must schedule a sync. Without it, the immediate
    ``clocks`` broadcast invalidates the local query and
    the frontend refetches the stale pre-start state — the
    running-timer card stays empty until the 5-minute
    poller catches up."""
    monkeypatch.setattr(
        scheduler, "_schedule_ws_sync", lambda: None,
    )
    # The timer-event broadcast at the top of the handler
    # imports broadcast_sync; stub it so this test stays
    # isolated to the routing logic.
    import kaisho.api.ws.manager as mgr
    monkeypatch.setattr(mgr, "broadcast_sync", lambda _: None)
    scheduler._on_cloud_ws_event("timer:started", {})
    assert "clocks" in scheduler._ws_pending_resources


def test_tasks_changed_maps_to_kanban(monkeypatch):
    """``tasks:changed`` must map to ``kanban`` because the
    frontend's RESOURCE_TO_QUERY only routes ``kanban`` to
    the tasks React Query — broadcasting ``tasks`` would be
    a no-op."""
    monkeypatch.setattr(
        scheduler, "_schedule_ws_sync", lambda: None,
    )
    scheduler._on_cloud_ws_event("tasks:changed", {})
    assert scheduler._ws_pending_resources == {"kanban"}


def test_drain_broadcasts_each_resource_once(monkeypatch):
    """Multiple events of the same type during one debounce
    window should result in a single broadcast per resource,
    not one per event."""
    captured = _capture_broadcasts(monkeypatch)
    scheduler._ws_pending_resources.update({"clocks", "inbox"})
    scheduler._drain_and_broadcast_pending()
    resources = {m["resource"] for m in captured}
    assert resources == {"clocks", "inbox"}
    assert all(m["type"] == "cloud:refresh" for m in captured)
    # The set is drained, so a second call is a no-op.
    captured.clear()
    scheduler._drain_and_broadcast_pending()
    assert captured == []


def test_drain_no_pending_does_not_broadcast(monkeypatch):
    captured = _capture_broadcasts(monkeypatch)
    scheduler._drain_and_broadcast_pending()
    assert captured == []


def test_debounced_sync_broadcasts_after_pull(monkeypatch):
    """End-to-end: a WS event schedules a sync, the sync
    runs, and the broadcast lands AFTER the pull (so the
    frontend refetches against fresh local SQL, not the
    stale rows the gate would otherwise show)."""
    order = []

    def fake_run_cloud_sync():
        order.append("sync")

    captured = _capture_broadcasts(monkeypatch)
    monkeypatch.setattr(
        scheduler, "_run_cloud_sync", fake_run_cloud_sync,
    )
    monkeypatch.setattr(scheduler.time, "sleep", lambda _: None)

    scheduler._on_cloud_ws_event("entries:changed", {})
    # The schedule started a real thread — wait for it.
    for t in threading.enumerate():
        if t.name == "cloud-ws-sync":
            t.join(timeout=2)
    order.append("broadcast" if captured else "missing")
    assert order == ["sync", "broadcast"]
    assert {m["resource"] for m in captured} == {"clocks"}


def test_failed_sync_does_not_broadcast(monkeypatch):
    """If the sync raises, the pending set must stay intact
    so the next attempt still has the resource recorded —
    and the frontend must NOT receive a refresh hint pointing
    at stale local data."""

    def boom():
        raise RuntimeError("sync exploded")

    captured = _capture_broadcasts(monkeypatch)
    monkeypatch.setattr(scheduler, "_run_cloud_sync", boom)
    monkeypatch.setattr(scheduler.time, "sleep", lambda _: None)

    scheduler._on_cloud_ws_event("entries:changed", {})
    for t in threading.enumerate():
        if t.name == "cloud-ws-sync":
            t.join(timeout=2)
    assert captured == []
    assert "clocks" in scheduler._ws_pending_resources
