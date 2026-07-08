"""Tests for the cloud-WS → frontend refresh broadcast.

The bug fixed in #148: ``entries:changed`` arriving from the
cloud scheduled a background sync but never told the local
React frontend to invalidate its queries, so the row kept
rendering from the existing cache until the app was
restarted. Plus the v2.5.2 audit cleanup that removed the
redundant pending-set in favour of ``_broadcast_sync_changes``
firing for every cycle.

These tests stub out the actual sync so we exercise only the
event-routing / broadcast wiring.
"""
import threading

import pytest

from kaisho.cron import scheduler


@pytest.fixture(autouse=True)
def _reset_pending_state():
    """Reset the debounce flag between tests so order
    doesn't matter."""
    scheduler._ws_sync_pending = False
    yield
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


def test_entries_changed_schedules_sync(monkeypatch):
    """``entries:changed`` triggers a debounced sync."""
    called = []
    monkeypatch.setattr(
        scheduler, "_schedule_ws_sync",
        lambda: called.append(True),
    )
    scheduler._on_cloud_ws_event("entries:changed", {})
    assert called == [True]


def test_timer_started_schedules_sync(monkeypatch):
    """A ``timer:started`` from the cloud (iPhone starting
    a brand-new timer or restarting a stopped entry) must
    schedule a sync. Without it, the desktop sees only
    the immediate clocks broadcast and refetches stale
    local state until the 5-minute poller catches up."""
    called = []
    monkeypatch.setattr(
        scheduler, "_schedule_ws_sync",
        lambda: called.append(True),
    )
    # The timer-event broadcast at the top of the handler
    # imports broadcast_sync; stub it so this test stays
    # isolated to the routing logic.
    import kaisho.api.ws.manager as mgr
    monkeypatch.setattr(mgr, "broadcast_sync", lambda _: None)
    scheduler._on_cloud_ws_event("timer:started", {})
    assert called == [True]


def test_tasks_changed_schedules_sync(monkeypatch):
    """``tasks:changed`` must still route through the
    event map even though the broadcast is now blanket
    rather than per-resource."""
    called = []
    monkeypatch.setattr(
        scheduler, "_schedule_ws_sync",
        lambda: called.append(True),
    )
    scheduler._on_cloud_ws_event("tasks:changed", {})
    assert called == [True]


def test_unknown_event_does_not_schedule_sync(monkeypatch):
    """Events the map doesn't know about are no-ops on the
    sync-trigger path."""
    called = []
    monkeypatch.setattr(
        scheduler, "_schedule_ws_sync",
        lambda: called.append(True),
    )
    scheduler._on_cloud_ws_event("noise:event", {})
    assert called == []


def test_debounced_sync_runs_cloud_sync(monkeypatch):
    """End-to-end: a WS event schedules a sync; the sync
    runs. The broadcast itself is fired from inside
    _run_cloud_sync → _broadcast_sync_changes, which has
    its own test below."""
    order = []

    def fake_run_cloud_sync():
        order.append("sync")

    monkeypatch.setattr(
        scheduler, "_run_cloud_sync", fake_run_cloud_sync,
    )
    monkeypatch.setattr(scheduler.time, "sleep", lambda _: None)
    scheduler._on_cloud_ws_event("entries:changed", {})
    for t in threading.enumerate():
        if t.name == "cloud-ws-sync":
            t.join(timeout=2)
    assert order == ["sync"]


def test_broadcast_sync_changes_covers_all_resources(
    monkeypatch,
):
    """``_broadcast_sync_changes`` must broadcast every
    resource in ``BROADCAST_RESOURCES`` -- the single
    source of truth that prevents the kanban / tasks
    silent-no-op trap from coming back."""
    captured = _capture_broadcasts(monkeypatch)
    scheduler._broadcast_sync_changes(
        {"pulled_up": 1, "pulled_del": 0},
    )
    resources = {m["resource"] for m in captured}
    assert resources == set(scheduler.BROADCAST_RESOURCES)
    assert "kanban" in resources
    assert "tasks" not in resources


def test_broadcast_sync_changes_fires_when_counts_zero(
    monkeypatch,
):
    """The old ``pulled+deleted == 0`` gate suppressed
    legitimate refreshes when the sync cycle returned
    zero counts (cursor races, push-lock contention,
    partial-success cycles). The function must broadcast
    every cycle, trusting that an occasional empty
    refetch is cheaper than the user staring at stale
    data."""
    captured = _capture_broadcasts(monkeypatch)
    scheduler._broadcast_sync_changes(
        {"pulled_up": 0, "pulled_del": 0},
    )
    resources = {m["resource"] for m in captured}
    assert resources == set(scheduler.BROADCAST_RESOURCES)


def test_broadcast_sync_changes_continues_on_single_failure(
    monkeypatch,
):
    """A broadcast that raises for one resource must not
    abort the rest of the loop. Mirrors the per-iteration
    try/except policy."""
    sent = []

    def flaky_broadcast(message):
        if message["resource"] == "clocks":
            raise RuntimeError("flaky")
        sent.append(message["resource"])

    import kaisho.api.ws.manager as mgr
    monkeypatch.setattr(
        mgr, "broadcast_sync", flaky_broadcast,
    )
    scheduler._broadcast_sync_changes({})
    # Every resource other than the one that raised
    # still got a broadcast.
    assert set(sent) == (
        set(scheduler.BROADCAST_RESOURCES) - {"clocks"}
    )


def test_failed_sync_does_not_broadcast(monkeypatch):
    """If ``_run_cloud_sync`` raises, the debounce wrapper
    swallows it cleanly — no broadcast, but also no
    crashed thread."""
    captured = _capture_broadcasts(monkeypatch)

    def boom():
        raise RuntimeError("sync exploded")

    monkeypatch.setattr(scheduler, "_run_cloud_sync", boom)
    monkeypatch.setattr(scheduler.time, "sleep", lambda _: None)

    scheduler._on_cloud_ws_event("entries:changed", {})
    for t in threading.enumerate():
        if t.name == "cloud-ws-sync":
            t.join(timeout=2)
    assert captured == []
