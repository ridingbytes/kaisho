"""Tests for task sync identity and wire format."""
import tempfile
import uuid
from pathlib import Path

from kaisho.services.kanban import (
    add_task,
    list_tasks,
    move_task,
    update_task,
)
from kaisho.services.cloud_sync import (
    task_to_wire,
    wire_to_task,
)

KEYWORDS = {"TODO", "IN_PROGRESS", "REVIEW", "DONE"}


def _tmp_todos(content: str = "") -> Path:
    td = tempfile.mkdtemp()
    p = Path(td) / "todos.org"
    if content:
        p.write_text(content, encoding="utf-8")
    else:
        p.write_text("", encoding="utf-8")
    return p


class TestTaskSyncIdentity:

    def test_new_task_has_sync_id(self):
        p = _tmp_todos()
        task = add_task(
            p, KEYWORDS, "Acme", "Fix login bug",
        )
        assert task.get("sync_id")
        assert len(task["sync_id"]) == 36
        assert task.get("updated_at")

    def test_backfill_on_list(self):
        content = (
            "* TODO [Acme]: Fix bug\n"
            "  :PROPERTIES:\n"
            "  :TASK_ID: abc123\n"
            "  :CREATED: [2026-04-01 Wed 10:00]\n"
            "  :END:\n"
        )
        p = _tmp_todos(content)
        tasks = list_tasks(p, KEYWORDS, include_done=True)
        assert len(tasks) == 1
        assert tasks[0].get("sync_id")
        assert tasks[0].get("updated_at")
        raw = p.read_text()
        assert "SYNC_ID" in raw

    def test_backfill_is_stable(self):
        content = (
            "* TODO [Beta]: Deploy\n"
            "  :PROPERTIES:\n"
            "  :TASK_ID: def456\n"
            "  :CREATED: [2026-04-01 Wed 10:00]\n"
            "  :END:\n"
        )
        p = _tmp_todos(content)
        t1 = list_tasks(p, KEYWORDS, include_done=True)
        t2 = list_tasks(p, KEYWORDS, include_done=True)
        assert t1[0]["sync_id"] == t2[0]["sync_id"]

    def test_move_bumps_updated_at(self):
        p = _tmp_todos()
        task = add_task(p, KEYWORDS, "X", "Test task")
        original = task["updated_at"]
        moved = move_task(p, KEYWORDS, task["id"], "DONE")
        assert moved["updated_at"] >= original

    def test_update_bumps_updated_at(self):
        p = _tmp_todos()
        task = add_task(p, KEYWORDS, "X", "Original")
        original = task["updated_at"]
        updated = update_task(
            p, KEYWORDS, task["id"], title="Changed",
        )
        assert updated["updated_at"] >= original


class TestTaskWireFormat:

    def test_task_to_wire(self):
        task = {
            "sync_id": str(uuid.uuid4()),
            "customer": "Acme",
            "title": "Fix bug",
            "status": "TODO",
            "tags": ["urgent"],
            "body": "Details",
            "github_url": "",
            "created": "2026-04-09T10:00:00",
            "updated_at": "2026-04-09T10:00:00",
        }
        wire = task_to_wire(task)
        assert wire["id"] == task["sync_id"]
        assert wire["status"] == "TODO"
        assert wire["tags"] == ["urgent"]

    def test_wire_to_task(self):
        wire = {
            "id": str(uuid.uuid4()),
            "customer": "Beta",
            "title": "Deploy",
            "status": "IN_PROGRESS",
            "tags": [],
            "body": "",
            "github_url": "",
            "created_at": "2026-04-08T12:00:00Z",
            "updated_at": "2026-04-08T12:00:00Z",
        }
        local = wire_to_task(wire)
        assert local["sync_id"] == wire["id"]
        assert local["status"] == "IN_PROGRESS"

    def test_round_trip(self):
        p = _tmp_todos()
        task = add_task(
            p, KEYWORDS, "Corp", "Round trip",
        )
        wire = task_to_wire(task)
        back = wire_to_task(wire)
        assert back["sync_id"] == task["sync_id"]
        assert back["status"] == task["status"]
