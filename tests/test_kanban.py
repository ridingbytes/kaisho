"""Tests for the kanban service."""
from pathlib import Path

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
