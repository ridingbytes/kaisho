"""Tests for inbox sync identity and wire format."""
import tempfile
import uuid
from pathlib import Path

from kaisho.services.inbox import (
    add_item,
    list_items,
    promote_to_task,
    update_item,
)
from kaisho.services.cloud_sync import (
    inbox_item_to_wire,
    wire_to_inbox_item,
)


def _tmp_inbox(content: str = "") -> Path:
    """Create a temp inbox.org file."""
    td = tempfile.mkdtemp()
    p = Path(td) / "inbox.org"
    if content:
        p.write_text(content, encoding="utf-8")
    return p


class TestInboxSyncIdentity:
    """SYNC_ID and UPDATED_AT on inbox items."""

    def test_new_item_has_sync_id(self):
        p = _tmp_inbox()
        item = add_item(p, "Test item")
        assert item.get("sync_id")
        assert len(item["sync_id"]) == 36  # UUID
        assert item.get("updated_at")

    def test_backfill_on_read(self):
        content = (
            "* NOTE Test backfill\n"
            "  :PROPERTIES:\n"
            "  :CREATED: [2026-04-01 Wed 10:00]\n"
            "  :END:\n"
        )
        p = _tmp_inbox(content)
        items = list_items(p)
        assert len(items) == 1
        assert items[0].get("sync_id")
        assert items[0].get("updated_at")

        # Verify persisted
        raw = p.read_text()
        assert "SYNC_ID" in raw
        assert "UPDATED_AT" in raw

    def test_backfill_is_stable(self):
        content = (
            "* NOTE Stable IDs\n"
            "  :PROPERTIES:\n"
            "  :CREATED: [2026-04-01 Wed 10:00]\n"
            "  :END:\n"
        )
        p = _tmp_inbox(content)
        items1 = list_items(p)
        items2 = list_items(p)
        assert items1[0]["sync_id"] == items2[0]["sync_id"]

    def test_update_bumps_updated_at(self):
        p = _tmp_inbox()
        item = add_item(p, "Original title")
        original_ts = item["updated_at"]

        updated = update_item(
            p, item["id"], {"title": "New title"},
        )
        assert updated["updated_at"] >= original_ts

    def test_multiple_items_get_unique_ids(self):
        p = _tmp_inbox()
        a = add_item(p, "Item A")
        b = add_item(p, "Item B")
        assert a["sync_id"] != b["sync_id"]


class TestInboxWireFormat:
    """Wire format conversion for cloud sync."""

    def test_item_to_wire(self):
        item = {
            "sync_id": str(uuid.uuid4()),
            "type": "EMAIL",
            "customer": "Acme",
            "title": "Follow up",
            "body": "Details here",
            "channel": "email",
            "direction": "out",
            "created": "2026-04-09T09:15:00",
            "updated_at": "2026-04-09T09:15:00",
        }
        wire = inbox_item_to_wire(item)
        assert wire["id"] == item["sync_id"]
        assert wire["type"] == "EMAIL"
        assert wire["customer"] == "Acme"
        assert wire["title"] == "Follow up"
        assert wire["body"] == "Details here"
        assert wire["channel"] == "email"
        assert wire["direction"] == "out"
        assert "created_at" in wire
        assert "updated_at" in wire

    def test_wire_to_item(self):
        wire = {
            "id": str(uuid.uuid4()),
            "type": "LEAD",
            "customer": "Beta Inc",
            "title": "Inquiry",
            "body": "",
            "channel": "",
            "direction": "in",
            "created_at": "2026-04-08T12:30:00Z",
            "updated_at": "2026-04-08T12:30:00Z",
        }
        local = wire_to_inbox_item(wire)
        assert local["sync_id"] == wire["id"]
        assert local["type"] == "LEAD"
        assert local["customer"] == "Beta Inc"
        assert local["title"] == "Inquiry"
        assert "created" in local
        assert "updated_at" in local
        assert "deleted_at" in local

    def test_round_trip(self):
        p = _tmp_inbox()
        item = add_item(
            p, "Round trip test",
            item_type="IDEA",
            customer="Test Corp",
        )
        wire = inbox_item_to_wire(item)
        back = wire_to_inbox_item(wire)
        assert back["sync_id"] == item["sync_id"]
        assert back["type"] == item["type"]
        # Push strips [Customer] prefix from the title;
        # pull preserves the clean title from the cloud.
        assert back["title"] == "Round trip test"

    def test_wire_defaults(self):
        wire = inbox_item_to_wire({
            "sync_id": str(uuid.uuid4()),
        })
        assert wire["type"] == "NOTE"
        assert wire["customer"] == ""
        assert wire["title"] == ""
        assert wire["direction"] == "in"


class TestStableItemId:
    """The dict ``id`` must be the sync_id, not a position
    index. Position-based ids race with concurrent writes
    (cron, cloud-sync pulls, MCP) and silently delete or
    update the wrong heading."""

    def test_id_equals_sync_id(self):
        p = _tmp_inbox()
        item = add_item(p, "Pick me")
        assert item["id"] == item["sync_id"]

    def test_id_survives_prepended_insert(self):
        """If a second item is inserted *before* the
        first heading (e.g. cron prepended an item, or
        a cloud-sync pull reordered the file), removing
        the first item by its original id must still
        target the original heading -- not whatever now
        occupies position 1."""
        from kaisho.org.parser import parse_org_file
        from kaisho.org.writer import write_org_file
        from kaisho.services.inbox import (
            INBOX_KEYWORDS, _find_by_sync_id,
        )

        p = _tmp_inbox()
        first = add_item(p, "First item")
        second = add_item(p, "Second item")

        # Simulate an out-of-band reorder: swap the two
        # headings in place, as a cron / sync writer
        # might do.
        of = parse_org_file(p, INBOX_KEYWORDS)
        of.headings.reverse()
        write_org_file(p, of)

        items = list_items(p)
        # IDs are still stable (sync_id), order flipped
        assert items[0]["id"] == second["id"]
        assert items[1]["id"] == first["id"]

        # Lookup by first's id still finds first's
        # heading despite the shuffle.
        of2 = parse_org_file(p, INBOX_KEYWORDS)
        heading = _find_by_sync_id(of2, first["id"])
        assert heading is not None
        assert "First item" in heading.title

    def test_update_by_sync_id(self):
        p = _tmp_inbox()
        first = add_item(p, "Original title")
        add_item(p, "Decoy")

        updated = update_item(
            p, first["id"], {"title": "Renamed"},
        )
        assert updated["title"] == "Renamed"
        assert updated["id"] == first["id"]

        # Decoy was not touched.
        titles = {i["title"] for i in list_items(p)}
        assert "Renamed" in titles
        assert any("Decoy" in t for t in titles)

    def test_tombstone_records_deleted_item_after_reorder(
        self, tmp_path, monkeypatch,
    ):
        """Deleting an inbox item by sync_id must tombstone
        *that* item even after the file has been reshuffled
        by an out-of-band writer. Pre-fix this was the
        wrong-item-deleted-and-tombstoned bug.
        """
        from kaisho.backends.org.inbox import OrgInboxBackend
        from kaisho.org.parser import parse_org_file
        from kaisho.org.writer import write_org_file
        from kaisho.services import cloud_sync, sync_state
        from kaisho.services.inbox import INBOX_KEYWORDS

        inbox_file = tmp_path / "inbox.org"
        inbox_file.write_text("", encoding="utf-8")
        profile_dir = tmp_path / "profile"
        profile_dir.mkdir()

        backend = OrgInboxBackend(inbox_file)
        target = backend.add_item(text="Pick me")
        backend.add_item(text="Decoy")

        of = parse_org_file(inbox_file, INBOX_KEYWORDS)
        of.headings.reverse()
        write_org_file(inbox_file, of)

        recorded = {}

        def fake_record(profile, entity, tombstone):
            recorded["entity"] = entity
            recorded["tombstone"] = tombstone

        monkeypatch.setattr(
            sync_state, "record_entity_tombstone",
            fake_record,
        )
        monkeypatch.setattr(
            cloud_sync, "schedule_push", lambda: None,
        )

        items = backend.list_items()
        deleted = next(
            i for i in items if i["sync_id"] == target["id"]
        )
        ok = backend.remove_item(deleted["id"])
        assert ok

        class _FakeCfg:
            PROFILE_DIR = profile_dir

        monkeypatch.setattr(
            "kaisho.config.get_config",
            lambda: _FakeCfg(),
        )
        cloud_sync.on_local_delete_inbox(deleted)

        assert recorded["entity"] == "inbox"
        assert recorded["tombstone"]["sync_id"] == target["id"]
        assert "Pick me" in recorded["tombstone"]["title"]

        remaining = backend.list_items()
        assert len(remaining) == 1
        assert "Decoy" in remaining[0]["title"]

    def test_promote_targets_correct_heading(self, tmp_path):
        """Promote-to-task must pick the heading whose
        sync_id matches, regardless of file position."""
        inbox_file = tmp_path / "inbox.org"
        todos_file = tmp_path / "todos.org"
        inbox_file.write_text("", encoding="utf-8")
        todos_file.write_text("", encoding="utf-8")

        target = add_item(inbox_file, "Promote me")
        add_item(inbox_file, "Leave me alone")

        # Reverse so the target sits at position 2.
        from kaisho.org.parser import parse_org_file
        from kaisho.org.writer import write_org_file
        from kaisho.services.inbox import INBOX_KEYWORDS

        of = parse_org_file(inbox_file, INBOX_KEYWORDS)
        of.headings.reverse()
        write_org_file(inbox_file, of)

        task = promote_to_task(
            inbox_file=inbox_file,
            todos_file=todos_file,
            keywords=set(),
            item_id=target["id"],
            customer="Acme",
        )
        assert "Promote me" in task["title"]

        remaining = list_items(inbox_file)
        assert len(remaining) == 1
        assert "Leave me alone" in remaining[0]["title"]
