"""Tests for the kanban service."""
import pytest

from kaisho.services import kanban as kanban_svc

KEYWORDS = {"TODO", "NEXT", "IN-PROGRESS", "WAIT", "DONE", "CANCELLED"}
DONE_STATES = {"DONE", "CANCELLED"}


def test_list_tasks_empty(org_dir):
    tasks = kanban_svc.list_tasks(
        org_dir / "todos.org", KEYWORDS
    )
    assert tasks == []


def test_add_and_list_task(org_dir):
    todos = org_dir / "todos.org"
    task = kanban_svc.add_task(todos, KEYWORDS, "ACME", "Fix login bug")
    assert "Fix login bug" in task["title"]
    assert task["customer"] == "ACME"
    assert task["status"] == "TODO"

    tasks = kanban_svc.list_tasks(todos, KEYWORDS, include_done=False)
    assert len(tasks) == 1


def test_move_task_changes_status(org_dir):
    todos = org_dir / "todos.org"
    task = kanban_svc.add_task(todos, KEYWORDS, "ACME", "Test task")
    moved = kanban_svc.move_task(todos, KEYWORDS, task["id"], "DONE")
    assert moved["status"] == "DONE"


def test_list_tasks_excludes_done_by_default(org_dir):
    todos = org_dir / "todos.org"
    kanban_svc.add_task(todos, KEYWORDS, "ACME", "Open task")
    t = kanban_svc.add_task(todos, KEYWORDS, "ACME", "Done task")
    kanban_svc.move_task(todos, KEYWORDS, t["id"], "DONE")

    open_tasks = kanban_svc.list_tasks(todos, KEYWORDS, include_done=False)
    assert len(open_tasks) == 1
    assert "Open task" in open_tasks[0]["title"]


def test_list_tasks_includes_done_when_requested(org_dir):
    todos = org_dir / "todos.org"
    t = kanban_svc.add_task(todos, KEYWORDS, "ACME", "Done task")
    kanban_svc.move_task(todos, KEYWORDS, t["id"], "DONE")

    all_tasks = kanban_svc.list_tasks(todos, KEYWORDS, include_done=True)
    assert len(all_tasks) == 1


def test_filter_by_customer(org_dir):
    todos = org_dir / "todos.org"
    kanban_svc.add_task(todos, KEYWORDS, "ACME", "ACME task")
    kanban_svc.add_task(todos, KEYWORDS, "OTHER", "Other task")

    acme = kanban_svc.list_tasks(todos, KEYWORDS, customer="ACME")
    assert len(acme) == 1
    assert acme[0]["customer"] == "ACME"


def test_archive_writes_destination_before_source(
    org_dir, monkeypatch,
):
    """A crash after the first write must not lose the
    task. We make the SECOND ``write_org_file`` raise and
    assert the task is still recoverable from archive.org
    (additive side written first), not gone from both."""
    todos = org_dir / "todos.org"
    archive = org_dir / "archive.org"
    task = kanban_svc.add_task(
        todos, KEYWORDS, "ACME", "Important task",
    )

    calls = {"n": 0}
    real_write = kanban_svc.write_org_file

    def flaky_write(path, org_file):
        calls["n"] += 1
        if calls["n"] == 2:
            raise OSError("simulated crash mid-archive")
        return real_write(path, org_file)

    monkeypatch.setattr(
        kanban_svc, "write_org_file", flaky_write,
    )

    with pytest.raises(OSError):
        kanban_svc.archive_task(
            todos, archive, KEYWORDS, task["id"],
        )

    # The task must survive somewhere. Because the archive
    # is written first, it lands there; the source still
    # has it too (duplicate is recoverable, loss is not).
    archived = kanban_svc.list_archived_tasks(
        archive, KEYWORDS,
    )
    assert any(
        "Important task" in a["title"] for a in archived
    )
