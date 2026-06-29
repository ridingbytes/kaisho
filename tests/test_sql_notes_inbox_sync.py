"""Cloud-sync identity for the SQL notes + inbox backends.

NoteRow / InboxRow used to lack ``sync_id`` and
``updated_at``, so the cloud collectors silently never
pushed them (empty ``updated_at`` never beats the cursor)
and the pull path could not match them (no ``sync_id``),
duplicating cloud notes on every sync. These tests pin the
identity round-trip.
"""
from types import SimpleNamespace

from sqlalchemy import text

from kaisho.backends.sql import make_sql_backend
from kaisho.services.cloud_sync import (
    collect_inbox_changes,
    collect_note_changes,
)
from kaisho.services.sync_state import EPOCH


def _backend(tmp_path):
    t, c, inbox, cust, notes, _ = make_sql_backend(
        f"sqlite:///{tmp_path / 'sync.db'}"
    )
    return SimpleNamespace(
        tasks=t, clocks=c, inbox=inbox,
        customers=cust, notes=notes,
    )


# ── Notes ─────────────────────────────────────────────


def test_add_note_has_sync_identity(tmp_path):
    b = _backend(tmp_path)
    note = b.notes.add_note("Hello")
    assert note["sync_id"]
    assert note["updated_at"]


def test_add_note_preserves_supplied_sync_id(tmp_path):
    """The cloud pull path calls ``add_note(sync_id=...)``;
    the supplied id must be stored, else pulled notes
    duplicate on every cycle."""
    b = _backend(tmp_path)
    note = b.notes.add_note("From cloud", sync_id="cloud-1")
    assert note["sync_id"] == "cloud-1"
    listed = b.notes.list_notes()
    assert listed[0]["sync_id"] == "cloud-1"


def test_update_note_bumps_updated_at(tmp_path):
    b = _backend(tmp_path)
    note = b.notes.add_note("Original")
    before = note["updated_at"]
    updated = b.notes.update_note(
        note["id"], {"title": "Changed"},
    )
    assert updated["updated_at"] >= before
    assert updated["sync_id"] == note["sync_id"]


def test_collect_note_changes_includes_sql_note(tmp_path):
    """The regression: a freshly added SQL note must be
    collected for push (it was skipped because
    ``updated_at`` was empty)."""
    b = _backend(tmp_path)
    b.notes.add_note("Push me")
    wire = collect_note_changes(b, EPOCH)
    assert len(wire) == 1


def test_note_backfill_on_read(tmp_path):
    """A legacy row with NULL sync_id/updated_at gets
    identity assigned on read and persisted."""
    b = _backend(tmp_path)
    b.notes.add_note("Legacy")
    # Simulate a pre-migration row.
    eng = b.notes._eng
    with eng.engine.begin() as conn:
        conn.execute(text(
            "UPDATE notes SET sync_id = NULL, "
            "updated_at = NULL"
        ))
    listed = b.notes.list_notes()
    assert listed[0]["sync_id"]
    assert listed[0]["updated_at"]
    # Stable across reads.
    again = b.notes.list_notes()
    assert again[0]["sync_id"] == listed[0]["sync_id"]


# ── Inbox ─────────────────────────────────────────────


def test_add_item_has_sync_identity(tmp_path):
    b = _backend(tmp_path)
    item = b.inbox.add_item("An idea")
    assert item["sync_id"]
    assert item["updated_at"]


def test_add_item_preserves_supplied_sync_id(tmp_path):
    b = _backend(tmp_path)
    item = b.inbox.add_item("From cloud", sync_id="ci-1")
    assert item["sync_id"] == "ci-1"


def test_update_item_bumps_updated_at(tmp_path):
    b = _backend(tmp_path)
    item = b.inbox.add_item("Original")
    before = item["updated_at"]
    updated = b.inbox.update_item(
        item["id"], {"title": "Changed"},
    )
    assert updated["updated_at"] >= before
    assert updated["sync_id"] == item["sync_id"]


def test_collect_inbox_changes_includes_sql_item(tmp_path):
    b = _backend(tmp_path)
    b.inbox.add_item("Push me")
    wire = collect_inbox_changes(b, EPOCH)
    assert len(wire) == 1
