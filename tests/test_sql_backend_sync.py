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


def test_delete_entry_by_sync_id(tmp_path):
    clocks = _clocks(tmp_path)
    clocks.apply_sync_payload(_payload())
    deleted = clocks.delete_entry_by_sync_id("s1")
    assert deleted is not None
    assert clocks.list_entries(period="all") == []
    # Deleting a missing sync_id is a no-op.
    assert clocks.delete_entry_by_sync_id("nope") is None
