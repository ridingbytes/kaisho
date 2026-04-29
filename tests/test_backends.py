"""Tests for markdown, JSON, and SQL backends.

All backends implement the same ABC interface, so we
parametrize all tests to run against all implementations.
"""
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest

from kaisho.backends.json_backend import (
    JsonClockBackend,
    JsonCustomerBackend,
    JsonInboxBackend,
    JsonNotesBackend,
    JsonTaskBackend,
)
from kaisho.backends.markdown import (
    MarkdownClockBackend,
    MarkdownCustomerBackend,
    MarkdownInboxBackend,
    MarkdownNotesBackend,
    MarkdownTaskBackend,
)
from kaisho.backends.sql import (
    SqlClockBackend,
    SqlCustomerBackend,
    SqlInboxBackend,
    SqlNotesBackend,
    SqlTaskBackend,
    _Engine,
)


# ---------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------


def _sql_dsn(tmp_path: Path) -> str:
    return f"sqlite:///{tmp_path / 'test.db'}"


@pytest.fixture(params=["markdown", "json", "sql"])
def tasks_backend(request, tmp_path):
    if request.param == "markdown":
        return MarkdownTaskBackend(
            tmp_path / "tasks.md",
            tmp_path / "archive.md",
        )
    if request.param == "json":
        return JsonTaskBackend(
            tmp_path / "tasks.json",
            tmp_path / "archive.json",
        )
    db = _Engine(_sql_dsn(tmp_path))
    return SqlTaskBackend(db)


@pytest.fixture(params=["markdown", "json", "sql"])
def clocks_backend(request, tmp_path):
    if request.param == "markdown":
        return MarkdownClockBackend(
            tmp_path / "clocks.md",
        )
    if request.param == "json":
        return JsonClockBackend(
            tmp_path / "clocks.json",
        )
    db = _Engine(_sql_dsn(tmp_path))
    return SqlClockBackend(db)


@pytest.fixture(params=["markdown", "json", "sql"])
def inbox_backend(request, tmp_path):
    if request.param == "markdown":
        return MarkdownInboxBackend(
            tmp_path / "inbox.md",
        )
    if request.param == "json":
        return JsonInboxBackend(
            tmp_path / "inbox.json",
        )
    db = _Engine(_sql_dsn(tmp_path))
    return SqlInboxBackend(db)


@pytest.fixture(params=["markdown", "json", "sql"])
def notes_backend(request, tmp_path):
    if request.param == "markdown":
        return MarkdownNotesBackend(
            tmp_path / "notes.md",
        )
    if request.param == "json":
        return JsonNotesBackend(
            tmp_path / "notes.json",
        )
    db = _Engine(_sql_dsn(tmp_path))
    return SqlNotesBackend(db)


@pytest.fixture(params=["markdown", "json", "sql"])
def customers_backend(request, tmp_path):
    if request.param == "markdown":
        return MarkdownCustomerBackend(
            tmp_path / "customers.md",
            tmp_path / "clocks.md",
        )
    if request.param == "json":
        return JsonCustomerBackend(
            tmp_path / "customers.json",
            tmp_path / "clocks.json",
        )
    db = _Engine(_sql_dsn(tmp_path))
    return SqlCustomerBackend(db)


# ---------------------------------------------------------------
# Task tests
# ---------------------------------------------------------------


class TestTaskBackend:
    def test_add_and_list(self, tasks_backend):
        task = tasks_backend.add_task(
            customer="Acme", title="Fix bug"
        )
        assert task["customer"] == "Acme"
        assert task["title"] == "Fix bug"
        assert task["status"] == "TODO"
        assert task["id"]

        tasks = tasks_backend.list_tasks()
        assert len(tasks) == 1
        assert tasks[0]["title"] == "Fix bug"

    def test_add_with_tags(self, tasks_backend):
        task = tasks_backend.add_task(
            customer="Acme",
            title="Tagged task",
            tags=["urgent", "bug"],
        )
        assert "urgent" in task.get("tags", [])
        assert "bug" in task.get("tags", [])

    def test_move_task(self, tasks_backend):
        task = tasks_backend.add_task(
            customer="Acme", title="Move me"
        )
        updated = tasks_backend.move_task(
            task["id"], "IN-PROGRESS"
        )
        assert updated["status"] == "IN-PROGRESS"

    def test_update_task(self, tasks_backend):
        task = tasks_backend.add_task(
            customer="Acme", title="Original"
        )
        updated = tasks_backend.update_task(
            task["id"], title="Updated title"
        )
        assert updated["title"] == "Updated title"
        assert updated["customer"] == "Acme"

    def test_update_task_customer(self, tasks_backend):
        task = tasks_backend.add_task(
            customer="Acme", title="Reassign"
        )
        updated = tasks_backend.update_task(
            task["id"], customer="NewCo"
        )
        assert updated["customer"] == "NewCo"

    def test_set_tags(self, tasks_backend):
        task = tasks_backend.add_task(
            customer="Acme", title="Tag me"
        )
        updated = tasks_backend.set_tags(
            task["id"], ["alpha", "beta"]
        )
        assert set(updated["tags"]) == {"alpha", "beta"}

    def test_archive_and_list_archived(self, tasks_backend):
        task = tasks_backend.add_task(
            customer="Acme", title="Archive me"
        )
        assert tasks_backend.archive_task(task["id"])
        assert tasks_backend.list_tasks() == []
        archived = tasks_backend.list_archived()
        assert len(archived) == 1

    def test_unarchive_task(self, tasks_backend):
        task = tasks_backend.add_task(
            customer="Acme", title="Restore me"
        )
        tasks_backend.archive_task(task["id"])
        assert tasks_backend.unarchive_task(task["id"])
        tasks = tasks_backend.list_tasks()
        assert len(tasks) == 1

    def test_archive_nonexistent(self, tasks_backend):
        assert not tasks_backend.archive_task("fake-id")

    def test_filter_by_status(self, tasks_backend):
        tasks_backend.add_task(
            customer="A", title="T1", status="TODO"
        )
        tasks_backend.add_task(
            customer="A", title="T2", status="DONE"
        )
        todos = tasks_backend.list_tasks(status=["TODO"])
        assert all(t["status"] == "TODO" for t in todos)

    def test_filter_by_customer(self, tasks_backend):
        tasks_backend.add_task(customer="A", title="T1")
        tasks_backend.add_task(customer="B", title="T2")
        result = tasks_backend.list_tasks(customer="A")
        assert len(result) == 1
        assert result[0]["customer"] == "A"

    def test_list_all_tags(self, tasks_backend):
        tasks_backend.add_task(
            customer="A", title="T1", tags=["bug"]
        )
        tasks_backend.add_task(
            customer="A", title="T2", tags=["bug", "feat"]
        )
        tag_list = tasks_backend.list_all_tags()
        by_name = {t["name"]: t["count"] for t in tag_list}
        assert by_name["bug"] == 2
        assert by_name["feat"] == 1


# ---------------------------------------------------------------
# Clock tests
# ---------------------------------------------------------------


class TestClockBackend:
    def test_quick_book(self, clocks_backend):
        entry = clocks_backend.quick_book(
            duration_str="1h30m",
            customer="Acme",
            description="Development",
        )
        assert entry["customer"] == "Acme"
        assert entry["duration_minutes"] == 90

    def test_start_and_stop(self, clocks_backend):
        entry = clocks_backend.start(
            customer="Acme", description="Working"
        )
        assert entry["customer"] == "Acme"
        active = clocks_backend.get_active()
        assert active is not None
        stopped = clocks_backend.stop()
        assert stopped["duration_minutes"] >= 0
        assert clocks_backend.get_active() is None

    def test_start_twice_raises(self, clocks_backend):
        clocks_backend.start(
            customer="Acme", description="First"
        )
        with pytest.raises(ValueError):
            clocks_backend.start(
                customer="Acme", description="Second"
            )

    def test_stop_without_start_raises(self, clocks_backend):
        with pytest.raises(ValueError):
            clocks_backend.stop()

    def test_update_entry_customer(self, clocks_backend):
        entry = clocks_backend.quick_book(
            duration_str="1h",
            customer="Old",
            description="Work",
        )
        updated = clocks_backend.update_entry(
            entry["start"], customer="New"
        )
        assert updated is not None
        assert updated["customer"] == "New"

    def test_update_entry_start_time(self, clocks_backend):
        entry = clocks_backend.quick_book(
            duration_str="2h",
            customer="Acme",
            description="Dev",
        )
        updated = clocks_backend.update_entry(
            entry["start"], start_time="09:00"
        )
        assert updated is not None
        start_dt = datetime.fromisoformat(updated["start"])
        assert start_dt.hour == 9
        assert start_dt.minute == 0

    def test_update_entry_hours(self, clocks_backend):
        entry = clocks_backend.quick_book(
            duration_str="1h",
            customer="Acme",
            description="Dev",
        )
        updated = clocks_backend.update_entry(
            entry["start"], hours=3.0
        )
        assert updated is not None
        assert updated["duration_minutes"] == 180

    def test_update_entry_nonexistent(self, clocks_backend):
        result = clocks_backend.update_entry(
            "2099-01-01T00:00:00", customer="Ghost"
        )
        assert result is None

    def test_delete_entry(self, clocks_backend):
        entry = clocks_backend.quick_book(
            duration_str="1h",
            customer="Acme",
            description="Dev",
        )
        assert clocks_backend.delete_entry(entry["start"])
        assert clocks_backend.list_entries(period="month") == []

    def test_delete_nonexistent(self, clocks_backend):
        assert not clocks_backend.delete_entry(
            "2099-01-01T00:00:00"
        )

    def test_update_by_sync_id_with_start_collision(
        self, clocks_backend,
    ):
        """When two entries share a start timestamp,
        ``sync_id`` must identify them unambiguously.
        ``start_iso`` alone always picks the first match.
        """
        target_date = date(2026, 5, 1)
        a = clocks_backend.quick_book(
            duration_str="1h",
            customer="A",
            description="alpha",
            target_date=target_date,
        )
        b = clocks_backend.quick_book(
            duration_str="1h",
            customer="B",
            description="beta",
            target_date=target_date,
        )
        assert a["start"] == b["start"]
        assert a["sync_id"] != b["sync_id"]

        updated = clocks_backend.update_entry(
            sync_id=b["sync_id"], invoiced=True,
        )
        assert updated is not None
        assert updated["sync_id"] == b["sync_id"]
        assert updated["invoiced"] is True

        entries = clocks_backend.list_entries(period="all")
        by_sync = {e["sync_id"]: e for e in entries}
        assert by_sync[b["sync_id"]]["invoiced"] is True
        assert by_sync[a["sync_id"]]["invoiced"] is False

    def test_delete_by_sync_id_with_start_collision(
        self, clocks_backend,
    ):
        target_date = date(2026, 5, 1)
        a = clocks_backend.quick_book(
            duration_str="1h",
            customer="A",
            description="alpha",
            target_date=target_date,
        )
        b = clocks_backend.quick_book(
            duration_str="1h",
            customer="B",
            description="beta",
            target_date=target_date,
        )
        deleted = clocks_backend.delete_entry(
            sync_id=b["sync_id"],
        )
        assert deleted is not None
        assert deleted["sync_id"] == b["sync_id"]

        remaining = clocks_backend.list_entries(period="all")
        assert len(remaining) == 1
        assert remaining[0]["sync_id"] == a["sync_id"]

    def test_list_entries_period(self, clocks_backend):
        clocks_backend.quick_book(
            duration_str="1h",
            customer="Acme",
            description="Today",
        )
        entries = clocks_backend.list_entries(period="today")
        assert len(entries) == 1

    def test_quick_book_with_contract(self, clocks_backend):
        entry = clocks_backend.quick_book(
            duration_str="2h",
            customer="Acme",
            description="Contract work",
            contract="Q1-2026",
        )
        assert entry.get("contract") == "Q1-2026"


# ---------------------------------------------------------------
# Inbox tests
# ---------------------------------------------------------------


class TestInboxBackend:
    def test_add_and_list(self, inbox_backend):
        item = inbox_backend.add_item(
            text="New idea", item_type="IDEA"
        )
        assert item["title"] == "New idea"
        items = inbox_backend.list_items()
        assert len(items) == 1

    def test_add_with_channel(self, inbox_backend):
        item = inbox_backend.add_item(
            text="Email from client",
            item_type="EMAIL",
            channel="email",
            direction="in",
            customer="Acme",
        )
        assert item.get("channel") == "email"
        assert item.get("direction") == "in"
        assert item.get("customer") == "Acme"

    def test_remove_item(self, inbox_backend):
        item = inbox_backend.add_item(text="Remove me")
        assert inbox_backend.remove_item(item["id"])
        assert inbox_backend.list_items() == []

    def test_remove_nonexistent(self, inbox_backend):
        assert not inbox_backend.remove_item("fake-id")

    def test_update_item(self, inbox_backend):
        item = inbox_backend.add_item(text="Original")
        updated = inbox_backend.update_item(
            item["id"], {"title": "Updated"}
        )
        assert updated["title"] == "Updated"

    def test_promote_to_task(self, inbox_backend, tmp_path):
        item = inbox_backend.add_item(
            text="Promote this"
        )
        # Create a task backend for the promotion target
        if isinstance(inbox_backend, MarkdownInboxBackend):
            tb = MarkdownTaskBackend(
                tmp_path / "tasks.md",
                tmp_path / "archive.md",
            )
        else:
            tb = JsonTaskBackend(
                tmp_path / "tasks.json",
                tmp_path / "archive.json",
            )
        task = inbox_backend.promote_to_task(
            item["id"], tb, customer="Acme"
        )
        assert task["customer"] == "Acme"
        assert inbox_backend.list_items() == []
        assert len(tb.list_tasks()) == 1


# ---------------------------------------------------------------
# Notes tests
# ---------------------------------------------------------------


class TestNotesBackend:
    def test_add_and_list(self, notes_backend):
        note = notes_backend.add_note(
            title="Meeting notes", body="Discussed Q1"
        )
        assert note["title"] == "Meeting notes"
        notes = notes_backend.list_notes()
        assert len(notes) == 1

    def test_add_with_tags(self, notes_backend):
        note = notes_backend.add_note(
            title="Tagged note", tags=["important"]
        )
        assert "important" in note.get("tags", [])

    def test_delete_note(self, notes_backend):
        note = notes_backend.add_note(title="Delete me")
        assert notes_backend.delete_note(note["id"])
        assert notes_backend.list_notes() == []

    def test_delete_nonexistent(self, notes_backend):
        assert not notes_backend.delete_note("fake-id")

    def test_update_note(self, notes_backend):
        note = notes_backend.add_note(title="Original")
        updated = notes_backend.update_note(
            note["id"], {"title": "Updated"}
        )
        assert updated["title"] == "Updated"


# ---------------------------------------------------------------
# Customer tests
# ---------------------------------------------------------------


class TestCustomerBackend:
    def test_add_and_list(self, customers_backend):
        cust = customers_backend.add_customer(
            name="Acme", budget=100
        )
        assert cust["name"] == "Acme"
        custs = customers_backend.list_customers()
        assert len(custs) == 1

    def test_add_duplicate_raises(self, customers_backend):
        customers_backend.add_customer(name="Acme")
        with pytest.raises(ValueError):
            customers_backend.add_customer(name="Acme")

    def test_get_customer(self, customers_backend):
        customers_backend.add_customer(
            name="Acme", budget=50
        )
        cust = customers_backend.get_customer("Acme")
        assert cust is not None
        assert cust["name"] == "Acme"

    def test_get_nonexistent(self, customers_backend):
        assert customers_backend.get_customer("Ghost") is None

    def test_update_customer(self, customers_backend):
        customers_backend.add_customer(
            name="Acme", budget=50
        )
        updated = customers_backend.update_customer(
            "Acme", {"budget": 200}
        )
        assert updated is not None
        assert updated["budget"] == 200

    def test_list_inactive(self, customers_backend):
        customers_backend.add_customer(
            name="Active", status="active"
        )
        customers_backend.add_customer(
            name="Gone", status="inactive"
        )
        active = customers_backend.list_customers(
            include_inactive=False
        )
        assert all(
            c["status"] != "inactive" for c in active
        )
        all_custs = customers_backend.list_customers(
            include_inactive=True
        )
        assert len(all_custs) == 2

    def test_add_and_list_contracts(self, customers_backend):
        customers_backend.add_customer(name="Acme")
        contract = customers_backend.add_contract(
            name="Acme",
            contract_name="Q1-2026",
            budget=80,
            start_date="2026-01-01",
        )
        assert contract["name"] == "Q1-2026"
        contracts = customers_backend.list_contracts("Acme")
        assert len(contracts) == 1

    def test_close_contract(self, customers_backend):
        customers_backend.add_customer(name="Acme")
        customers_backend.add_contract(
            name="Acme",
            contract_name="Q1",
            budget=100,
            start_date="2026-01-01",
        )
        closed = customers_backend.close_contract(
            "Acme", "Q1", "2026-03-31"
        )
        assert closed is not None
        assert closed.get("end_date") == "2026-03-31"

    def test_delete_contract(self, customers_backend):
        customers_backend.add_customer(name="Acme")
        customers_backend.add_contract(
            name="Acme",
            contract_name="Q1",
            budget=100,
            start_date="2026-01-01",
        )
        assert customers_backend.delete_contract("Acme", "Q1")
        assert customers_backend.list_contracts("Acme") == []

    def test_budget_summary(self, customers_backend):
        customers_backend.add_customer(
            name="Acme", budget=100
        )
        summary = customers_backend.get_budget_summary()
        assert len(summary) >= 1
        acme = next(
            s for s in summary if s["name"] == "Acme"
        )
        assert acme["budget"] == 100
