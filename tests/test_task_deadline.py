"""Round-trip tests for the ``deadline`` task field across
all four backends + the cloud wire format.

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

def test_sql_add_and_read_dates(tmp_path):
    from kaisho.backends.sql import make_sql_backend
    eng_tuple = make_sql_backend(
        f"sqlite:///{tmp_path / 'sched.db'}",
    )
    tasks = eng_tuple[0]
    task = tasks.add_task(
        customer="Acme",
        title="Deadline me",
        deadline="2099-06-20",
    )
    assert task["deadline"] == "2099-06-20"

    listed = tasks.list_tasks(include_done=True)
    assert listed[0]["deadline"] == "2099-06-20"


def test_sql_update_sets_and_clears_dates(tmp_path):
    from kaisho.backends.sql import make_sql_backend
    tasks = make_sql_backend(
        f"sqlite:///{tmp_path / 'sched.db'}"
    )[0]
    task = tasks.add_task(customer="A", title="T")
    assert task["deadline"] is None

    tasks.update_task(
        task["id"],
        deadline="2099-06-20",
    )
    again = tasks.list_tasks(include_done=True)[0]
    assert again["deadline"] == "2099-06-20"

    # Empty string clears.
    tasks.update_task(
        task["id"], deadline="",
    )
    again = tasks.list_tasks(include_done=True)[0]
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

    # The new column must exist now: inserting via the
    # backend with deadline set should round-trip without
    # raising "no such column".
    task = tasks.add_task(
        customer="Acme",
        title="Migrated",
        deadline="2099-06-20",
    )
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
        title="Deadline me",
        deadline="2099-06-20",
    )
    assert task["deadline"] == "2099-06-20"

    # File on disk has the DEADLINE property.
    text = (tmp_path / "todos.org").read_text("utf-8")
    assert ":DEADLINE: 2099-06-20" in text


def test_org_update_clears_dates_on_empty_string(tmp_path):
    backend = _org_backend(tmp_path)
    task = backend.add_task(
        customer="Acme",
        title="T",
        deadline="2099-06-20",
    )
    backend.update_task(
        task["id"], deadline="",
    )
    text = (tmp_path / "todos.org").read_text("utf-8")
    assert "DEADLINE" not in text
    again = backend.list_tasks(include_done=True)[0]
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
        deadline="2099-06-20",
    )
    assert task["deadline"] == "2099-06-20"

    raw = json.loads(
        (tmp_path / "tasks.json").read_text("utf-8"),
    )
    assert raw[0]["deadline"] == "2099-06-20"

    # Round-trip via a fresh backend instance so the dates
    # survive a save/load cycle (the markdown test does
    # this; the JSON one was missing it before the audit).
    fresh = _json_backend(tmp_path)
    again = fresh.list_tasks(include_done=True)[0]
    assert again["deadline"] == "2099-06-20"


def test_json_legacy_row_normalises_missing_dates(
    tmp_path,
):
    """A JSON file written before deadline existed must
    come back with the key present and set to None —
    otherwise the dict shape diverges from what SQL and
    markdown emit and from what
    ``frontend/src/types.ts:Task`` expects."""
    legacy = [{
        "id": "abc",
        "customer": "Acme",
        "title": "Old task",
        "status": "TODO",
        "tags": [],
        "body": "",
        "github_url": "",
        "created": "2026-01-01T10:00:00",
    }]
    (tmp_path / "tasks.json").write_text(
        json.dumps(legacy), encoding="utf-8",
    )
    backend = _json_backend(tmp_path)
    task = backend.list_tasks(include_done=True)[0]
    assert "deadline" in task
    assert task["deadline"] is None


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
        deadline="2099-06-20",
    )
    assert task["deadline"] == "2099-06-20"

    text = (tmp_path / "tasks.md").read_text("utf-8")
    assert "deadline" in text
    assert "2099-06-20" in text

    # Round-trip the file via a fresh backend instance to
    # confirm the dates survive a save/load cycle.
    fresh = _md_backend(tmp_path)
    again = fresh.list_tasks(include_done=True)[0]
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
        "deadline": "2099-06-20",
        "created": "2026-06-09T10:00:00",
        "updated_at": "2026-06-09T10:00:00",
    }
    wire = task_to_wire(local)
    assert wire["deadline"] == "2099-06-20"

    back = wire_to_task(wire)
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
    assert wire["deadline"] is None
    back = wire_to_task(wire)
    assert back["deadline"] is None


# -- Cloud pull does not clobber local dates --------------

class _BackendShim:
    """Minimal stand-in for the kaisho backend façade so
    cloud-sync helpers can be called against a single
    sub-backend in tests. The production code expects
    ``backend.tasks`` (and other domain attributes); this
    wrapper exposes just what ``_apply_task_update``
    needs."""

    def __init__(self, tasks_backend):
        self.tasks = tasks_backend


def test_cloud_pull_does_not_clear_local_dates(tmp_path):
    """A wire entry from an older peer (or a fresh peer
    that never set the date) carries ``deadline: None``.
    The cloud-pull path must interpret ``None`` as "leave
    the local value alone", not as "clear". Coercing
    ``None`` → ``""`` silently wiped a local-set date every
    time a remote edited the task for any other reason."""
    from kaisho.services.cloud_sync import _apply_task_update
    tasks = _org_backend(tmp_path)
    backend = _BackendShim(tasks)
    task = tasks.add_task(
        customer="Acme",
        title="Locally deadlined",
        deadline="2099-06-20",
    )
    existing = tasks.list_tasks(include_done=True)[0]
    assert existing["deadline"] == "2099-06-20"

    incoming = {
        "sync_id": task["sync_id"],
        "customer": "Acme",
        "title": "Locally deadlined",
        "status": "TODO",
        "tags": [],
        "body": "edited remotely",
        "github_url": "",
        "deadline": None,
        "updated_at": "2099-12-31T00:00:00",
    }
    _apply_task_update(backend, incoming, existing)

    after = tasks.list_tasks(include_done=True)[0]
    assert after["deadline"] == "2099-06-20", (
        "cloud pull with deadline=None must NOT wipe "
        "the local deadline date"
    )
    # The remote did change something — confirm the
    # legitimate field went through.
    assert after["body"] == "edited remotely"
