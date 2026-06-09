"""Cloud-sync contract for the SQL clock backend.

SqlClockBackend used to inherit the base NotImplementedError
for apply_sync_payload, crashing the sync thread on the first
pull. These tests pin the upsert/LWW/delete behavior so it
stays implemented.
"""
from kaisho.backends.sql import make_sql_backend


def _clocks(tmp_path):
    dsn = f"sqlite:///{tmp_path / 'sync.db'}"
    return make_sql_backend(dsn)[1]


def _payload(**over):
    base = {
        "sync_id": "s1",
        "customer": "Acme",
        "description": "Work",
        "start": "2026-05-20T09:00:00",
        "end": "2026-05-20T11:00:00",
        "updated_at": "2026-05-20T11:00:01",
        "invoiced": False,
    }
    base.update(over)
    return base


def test_apply_inserts_new_entry(tmp_path):
    clocks = _clocks(tmp_path)
    entry = clocks.apply_sync_payload(_payload())
    assert entry["sync_id"] == "s1"
    assert entry["customer"] == "Acme"
    assert len(clocks.list_entries(period="all")) == 1


def test_apply_is_last_writer_wins(tmp_path):
    clocks = _clocks(tmp_path)
    clocks.apply_sync_payload(_payload())
    # Older remote is skipped.
    clocks.apply_sync_payload(_payload(
        customer="Older", updated_at="2026-05-20T10:00:00",
    ))
    assert clocks.list_entries(
        period="all")[0]["customer"] == "Acme"
    # Newer remote wins.
    clocks.apply_sync_payload(_payload(
        customer="Newer", updated_at="2026-05-20T12:00:00",
    ))
    assert clocks.list_entries(
        period="all")[0]["customer"] == "Newer"
    # Still one row (upsert, not insert).
    assert len(clocks.list_entries(period="all")) == 1


def test_apply_clears_local_paused_flag(tmp_path):
    """A cloud pull must clear the desktop-local ``paused``
    flag. ``paused`` is a desktop-only UI affordance and
    never crosses the wire, so the only way the local row
    has ``paused=True`` is because someone hit Pause on
    this device. The cloud sending an update (or, in
    practice, the other-device having resumed/stopped) is
    proof the entry is no longer paused; failing to clear
    leaves the running-timer card stuck on a stale Resume
    affordance."""
    clocks = _clocks(tmp_path)
    # Insert a running entry, then locally pause it via
    # ``stop(paused=True)`` — same flow as the desktop
    # Pause button.
    clocks.apply_sync_payload(_payload(end=None))
    clocks.stop(paused=True)
    paused_row = clocks.list_entries(period="all")[0]
    assert paused_row["paused"] is True

    # Cloud sends a newer update — typically because
    # another device resumed or stopped the entry. The
    # local paused flag must be cleared. A far-future
    # ``updated_at`` keeps last-writer-wins out of the
    # way (``stop()`` stamps the local row with the real
    # wall clock, so a 2026-dated payload would be
    # skipped on a machine in 2026).
    clocks.apply_sync_payload(_payload(
        end="2099-01-01T13:00:00",
        updated_at="2099-01-01T13:00:01",
    ))
    after = clocks.list_entries(period="all")[0]
    assert after["paused"] is False


def test_apply_keeps_paused_when_end_unchanged(tmp_path):
    """A cloud-origin update that does NOT touch ``end``
    (notes appended, customer renamed) must leave the
    local ``paused`` flag alone. The user paused on this
    device and still intends to resume; an unrelated
    remote edit must not silently wipe that intent.

    Mirror of
    ``test_pull_preserves_paused_on_non_timing_edit`` for
    the org backend."""
    clocks = _clocks(tmp_path)
    clocks.apply_sync_payload(_payload(end=None))
    clocks.stop(paused=True)
    paused_row = clocks.list_entries(period="all")[0]
    assert paused_row["paused"] is True
    paused_end = paused_row["end"]

    # Cloud sends a newer update with the SAME end
    # timestamp — only the notes / description moved.
    clocks.apply_sync_payload(_payload(
        end=paused_end,
        description="remote updated description",
        updated_at="2099-01-01T13:00:01",
    ))
    after = clocks.list_entries(period="all")[0]
    assert after["paused"] is True, (
        "paused must survive a cloud pull that did not "
        "change end -- only resume or stop should clear "
        "the local pause intent"
    )
    assert (
        after["description"]
        == "remote updated description"
    )


def test_delete_entry_by_sync_id(tmp_path):
    clocks = _clocks(tmp_path)
    clocks.apply_sync_payload(_payload())
    deleted = clocks.delete_entry_by_sync_id("s1")
    assert deleted is not None
    assert clocks.list_entries(period="all") == []
    # Deleting a missing sync_id is a no-op.
    assert clocks.delete_entry_by_sync_id("nope") is None
