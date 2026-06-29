"""Tests for note sync identity and wire format."""
import tempfile
import uuid
from pathlib import Path

from kaisho.services.notes import (
    add_note,
    delete_note,
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

    def test_id_equals_sync_id(self):
        """The note id is now its stable SYNC_ID, not a
        positional index."""
        p = _tmp_notes()
        note = add_note(p, "Test")
        assert note["id"] == note["sync_id"]

    def test_addressing_survives_insert_before(self):
        """The original bug: a note's id was its list
        position, so inserting a note ahead of it made a
        later update/delete by the old id hit the WRONG
        note. With SYNC_ID addressing the id stays valid."""
        p = _tmp_notes()
        first = add_note(p, "First")
        # Insert another note; under positional addressing
        # ``first`` would shift and its old id "1" would
        # now point at the wrong heading.
        add_note(p, "Second")
        # Update by the original id must still hit "First".
        updated = update_note(
            p, first["id"], {"title": "First edited"},
        )
        assert updated["sync_id"] == first["sync_id"]
        assert updated["title"] == "First edited"
        titles = {n["title"] for n in list_notes(p)}
        assert titles == {"First edited", "Second"}

    def test_delete_by_sync_id_removes_right_note(self):
        p = _tmp_notes()
        a = add_note(p, "Alpha")
        add_note(p, "Beta")
        assert delete_note(p, a["id"]) is True
        titles = [n["title"] for n in list_notes(p)]
        assert titles == ["Beta"]

    def test_delete_unknown_id_returns_false(self):
        p = _tmp_notes()
        add_note(p, "Only")
        assert delete_note(p, "no-such-id") is False
        assert delete_note(p, "12345") is False


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
