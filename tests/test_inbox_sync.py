"""Tests for inbox sync identity and wire format."""
import tempfile
import uuid
from pathlib import Path

from kaisho.services.inbox import (
    add_item,
    list_items,
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
        assert back["title"] == item["title"]

    def test_wire_defaults(self):
        wire = inbox_item_to_wire({
            "sync_id": str(uuid.uuid4()),
        })
        assert wire["type"] == "NOTE"
        assert wire["customer"] == ""
        assert wire["title"] == ""
        assert wire["direction"] == "in"
