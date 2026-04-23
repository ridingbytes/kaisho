"""Tests for note sync identity and wire format."""
import tempfile
import uuid
from pathlib import Path

from kaisho.services.notes import (
    add_note,
    list_notes,
    update_note,
)
from kaisho.services.cloud_sync import (
    note_to_wire,
    wire_to_note,
)


def _tmp_notes(content: str = "") -> Path:
    td = tempfile.mkdtemp()
    p = Path(td) / "notes.org"
    if content:
        p.write_text(content, encoding="utf-8")
    return p


class TestNoteSyncIdentity:

    def test_new_note_has_sync_id(self):
        p = _tmp_notes()
        note = add_note(p, "Test note")
        assert note.get("sync_id")
        assert len(note["sync_id"]) == 36
        assert note.get("updated_at")

    def test_backfill_on_list(self):
        content = (
            "* Meeting notes\n"
            "  :PROPERTIES:\n"
            "  :CREATED: [2026-04-01 Wed 10:00]\n"
            "  :END:\n"
        )
        p = _tmp_notes(content)
        notes = list_notes(p)
        assert len(notes) == 1
        assert notes[0].get("sync_id")
        raw = p.read_text()
        assert "SYNC_ID" in raw

    def test_backfill_is_stable(self):
        content = (
            "* Stable note\n"
            "  :PROPERTIES:\n"
            "  :CREATED: [2026-04-01 Wed 10:00]\n"
            "  :END:\n"
        )
        p = _tmp_notes(content)
        n1 = list_notes(p)
        n2 = list_notes(p)
        assert n1[0]["sync_id"] == n2[0]["sync_id"]

    def test_update_bumps_updated_at(self):
        p = _tmp_notes()
        note = add_note(p, "Original")
        original = note["updated_at"]
        updated = update_note(
            p, note["id"], {"title": "Changed"},
        )
        assert updated["updated_at"] >= original


class TestNoteWireFormat:

    def test_note_to_wire(self):
        note = {
            "sync_id": str(uuid.uuid4()),
            "customer": "Acme",
            "title": "Meeting notes",
            "body": "Details",
            "tags": ["meeting"],
            "task_id": None,
            "created": "2026-04-09T10:00:00",
            "updated_at": "2026-04-09T10:00:00",
        }
        wire = note_to_wire(note)
        assert wire["id"] == note["sync_id"]
        assert wire["title"] == "Meeting notes"
        assert wire["tags"] == ["meeting"]

    def test_wire_to_note(self):
        wire = {
            "id": str(uuid.uuid4()),
            "customer": "Beta",
            "title": "Call notes",
            "body": "",
            "tags": [],
            "task_id": None,
            "created_at": "2026-04-08T12:00:00Z",
            "updated_at": "2026-04-08T12:00:00Z",
        }
        local = wire_to_note(wire)
        assert local["sync_id"] == wire["id"]
        assert local["title"] == "Call notes"

    def test_round_trip(self):
        p = _tmp_notes()
        note = add_note(p, "Round trip", customer="Corp")
        wire = note_to_wire(note)
        back = wire_to_note(wire)
        assert back["sync_id"] == note["sync_id"]
        assert back["title"] == note["title"]
