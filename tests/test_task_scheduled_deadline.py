"""Round-trip tests for the new ``scheduled`` / ``deadline``
task fields across all four backends + the cloud wire
format.

Per the backend-parity rule: every data-model change must
be implemented in every backend (org, markdown, sql,
json) so a profile conversion never silently drops data.
These tests pin that contract.
"""
import json

from kaisho.services.cloud_sync import (
    task_to_wire, wire_to_task,
)


# -- SQL backend ------------------------------------------

def _sql_clocks_tasks(tmp_path):
    from kaisho.backends.sql import make_sql_backend
    dsn = f"sqlite:///{tmp_path / 'sched.db'}"
    backend = make_sql_backend(dsn)
    # make_sql_backend returns (tasks, clocks, ...) tuple
    # in some shapes; SqlTaskBackend is the first element
    # named ``tasks`` on the returned object — use the
    # public attribute so we stay decoupled from the tuple
    # order.
    return backend


def test_sql_add_and_read_dates(tmp_path):
    from kaisho.backends.sql import make_sql_backend
    eng_tuple = make_sql_backend(
        f"sqlite:///{tmp_path / 'sched.db'}",
    )
    # eng_tuple is a NamedTuple-like; access via ``tasks``
    # attribute / index. Iterating the convention used in
    # other tests:
    tasks = eng_tuple[0]
    task = tasks.add_task(
        customer="Acme",
        title="Snooze me",
        scheduled="2099-06-15",
        deadline="2099-06-20",
    )
    assert task["scheduled"] == "2099-06-15"
    assert task["deadline"] == "2099-06-20"

    listed = tasks.list_tasks(include_done=True)
    assert listed[0]["scheduled"] == "2099-06-15"
    assert listed[0]["deadline"] == "2099-06-20"


def test_sql_update_sets_and_clears_dates(tmp_path):
    from kaisho.backends.sql import make_sql_backend
    tasks = make_sql_backend(
        f"sqlite:///{tmp_path / 'sched.db'}"
    )[0]
    task = tasks.add_task(customer="A", title="T")
    assert task["scheduled"] is None
    assert task["deadline"] is None

    tasks.update_task(
        task["id"],
        scheduled="2099-06-15",
        deadline="2099-06-20",
    )
    again = tasks.list_tasks(include_done=True)[0]
    assert again["scheduled"] == "2099-06-15"
    assert again["deadline"] == "2099-06-20"

    # Empty string clears.
    tasks.update_task(
        task["id"], scheduled="", deadline="",
    )
    again = tasks.list_tasks(include_done=True)[0]
    assert again["scheduled"] is None
    assert again["deadline"] is None


def test_sql_ensure_task_date_columns_is_idempotent(
    tmp_path,
):
    """Calling the migration twice on a fresh DB is a no-op
    — newly-created tables already have the columns."""
    from kaisho.backends.sql import (
        _Engine,
        _ensure_task_date_columns,
    )
    eng = _Engine(f"sqlite:///{tmp_path / 'sched.db'}")
    # Migration runs in _Engine.__init__; calling it again
    # should not raise.
    _ensure_task_date_columns(eng.engine)


def test_sql_legacy_db_gets_columns_added(tmp_path):
    """A DB created without the new columns gets ALTER
    TABLE-patched on open."""
    import sqlite3
    db_path = tmp_path / "legacy.db"
    # Hand-build a tasks table that's missing the new
    # columns, mirroring what an older kaisho install would
    # have on disk.
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "CREATE TABLE tasks ("
            "id TEXT PRIMARY KEY, customer TEXT, title TEXT,"
            " status TEXT, tags TEXT, body TEXT,"
            " github_url TEXT, properties TEXT,"
            " created TEXT, archived_at TEXT,"
            " archive_status TEXT)"
        )

    from kaisho.backends.sql import make_sql_backend
    tasks = make_sql_backend(f"sqlite:///{db_path}")[0]

    # The new columns must exist now: inserting via the
    # backend with scheduled/deadline set should round-trip
    # without raising "no such column".
    task = tasks.add_task(
        customer="Acme",
        title="Migrated",
        scheduled="2099-06-15",
        deadline="2099-06-20",
    )
    assert task["scheduled"] == "2099-06-15"
    assert task["deadline"] == "2099-06-20"


# -- Org backend ------------------------------------------

def _org_backend(tmp_path):
    from kaisho.backends.org.tasks import OrgTaskBackend
    todos = tmp_path / "todos.org"
    archive = tmp_path / "archive.org"
    todos.write_text("", encoding="utf-8")
    return OrgTaskBackend(
        todos_file=todos,
        archive_file=archive,
        keywords={"TODO", "DONE", "CANCELLED"},
    )


def test_org_add_and_read_dates(tmp_path):
    backend = _org_backend(tmp_path)
    task = backend.add_task(
        customer="Acme",
        title="Snooze me",
        scheduled="2099-06-15",
        deadline="2099-06-20",
    )
    assert task["scheduled"] == "2099-06-15"
    assert task["deadline"] == "2099-06-20"

    # File on disk has the SCHEDULED / DEADLINE properties.
    text = (tmp_path / "todos.org").read_text("utf-8")
    assert ":SCHEDULED: 2099-06-15" in text
    assert ":DEADLINE: 2099-06-20" in text


def test_org_update_clears_dates_on_empty_string(tmp_path):
    backend = _org_backend(tmp_path)
    task = backend.add_task(
        customer="Acme",
        title="T",
        scheduled="2099-06-15",
        deadline="2099-06-20",
    )
    backend.update_task(
        task["id"], scheduled="", deadline="",
    )
    text = (tmp_path / "todos.org").read_text("utf-8")
    assert "SCHEDULED" not in text
    assert "DEADLINE" not in text
    again = backend.list_tasks(include_done=True)[0]
    assert again["scheduled"] is None
    assert again["deadline"] is None


# -- JSON backend -----------------------------------------

def _json_backend(tmp_path):
    from kaisho.backends.json_backend import (
        JsonTaskBackend,
    )
    return JsonTaskBackend(
        tasks_file=tmp_path / "tasks.json",
        archive_file=tmp_path / "archive.json",
    )


def test_json_add_and_read_dates(tmp_path):
    backend = _json_backend(tmp_path)
    task = backend.add_task(
        customer="Acme",
        title="T",
        scheduled="2099-06-15",
        deadline="2099-06-20",
    )
    assert task["scheduled"] == "2099-06-15"
    assert task["deadline"] == "2099-06-20"

    raw = json.loads(
        (tmp_path / "tasks.json").read_text("utf-8"),
    )
    assert raw[0]["scheduled"] == "2099-06-15"
    assert raw[0]["deadline"] == "2099-06-20"


# -- Markdown backend -------------------------------------

def _md_backend(tmp_path):
    from kaisho.backends.markdown import (
        MarkdownTaskBackend,
    )
    return MarkdownTaskBackend(
        tasks_file=tmp_path / "tasks.md",
        archive_file=tmp_path / "archive.md",
    )


def test_markdown_add_and_read_dates(tmp_path):
    backend = _md_backend(tmp_path)
    task = backend.add_task(
        customer="Acme",
        title="T",
        scheduled="2099-06-15",
        deadline="2099-06-20",
    )
    assert task["scheduled"] == "2099-06-15"
    assert task["deadline"] == "2099-06-20"

    text = (tmp_path / "tasks.md").read_text("utf-8")
    assert "scheduled" in text
    assert "2099-06-15" in text
    assert "deadline" in text
    assert "2099-06-20" in text

    # Round-trip the file via a fresh backend instance to
    # confirm the dates survive a save/load cycle.
    fresh = _md_backend(tmp_path)
    again = fresh.list_tasks(include_done=True)[0]
    assert again["scheduled"] == "2099-06-15"
    assert again["deadline"] == "2099-06-20"


# -- Cloud wire format ------------------------------------

def test_wire_round_trip_preserves_dates():
    local = {
        "sync_id": "abc",
        "customer": "Acme",
        "title": "T",
        "status": "TODO",
        "tags": [],
        "body": "",
        "github_url": "",
        "scheduled": "2099-06-15",
        "deadline": "2099-06-20",
        "created": "2026-06-09T10:00:00",
        "updated_at": "2026-06-09T10:00:00",
    }
    wire = task_to_wire(local)
    assert wire["scheduled"] == "2099-06-15"
    assert wire["deadline"] == "2099-06-20"

    back = wire_to_task(wire)
    assert back["scheduled"] == "2099-06-15"
    assert back["deadline"] == "2099-06-20"


def test_wire_handles_missing_dates_as_none():
    local = {
        "sync_id": "abc",
        "customer": "Acme",
        "title": "T",
        "status": "TODO",
        "tags": [],
        "body": "",
        "github_url": "",
        "created": "2026-06-09T10:00:00",
        "updated_at": "2026-06-09T10:00:00",
    }
    wire = task_to_wire(local)
    assert wire["scheduled"] is None
    assert wire["deadline"] is None
    back = wire_to_task(wire)
    assert back["scheduled"] is None
    assert back["deadline"] is None
