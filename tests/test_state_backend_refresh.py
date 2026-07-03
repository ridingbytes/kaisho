"""Adding a kanban column must refresh the org backend.

The org backend derives its TODO-keyword set from
``task_states`` and caches it on a process-wide singleton.
Before the fix, ``POST /api/settings/states`` saved the new
state but never invalidated that cache, so a task moved to
the freshly added column parsed as an unknown keyword and
vanished from the board until a server restart.
"""
import pytest


@pytest.fixture(autouse=True)
def _isolate_env(tmp_path, monkeypatch):
    """Point the app at a temp profile with two states.

    Seeds ``settings.yaml`` with TODO/DONE (no Backlog) so
    the backend's first build caches only those keywords —
    the exact precondition for the stale-cache bug.
    """
    data_dir = tmp_path / ".kaisho"
    profile_dir = data_dir / "profiles" / "default"
    org_dir = profile_dir / "org"
    org_dir.mkdir(parents=True)
    for f in (
        "todos.org", "clocks.org", "customers.org",
        "inbox.org", "notes.org", "archive.org",
    ):
        (org_dir / f).write_text("", encoding="utf-8")

    monkeypatch.setenv("KAISHO_HOME", str(data_dir))
    monkeypatch.setenv("PROFILE", "default")

    from kaisho.config import reset_config
    from kaisho.backends import get_backend
    reset_config()
    get_backend.cache_clear()

    from kaisho.config import get_config
    from kaisho.services import settings as settings_svc
    settings_svc.save_settings(
        get_config().SETTINGS_FILE,
        {"task_states": [
            {"name": "TODO", "label": "Todo",
             "color": "#888", "done": False},
            {"name": "DONE", "label": "Done",
             "color": "#0a0", "done": True},
        ]},
    )

    yield

    reset_config()
    get_backend.cache_clear()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from kaisho.api.app import app
    return TestClient(app, raise_server_exceptions=False)


def test_task_moved_to_new_column_stays_visible(client):
    """Create a TODO task, add a Backlog column, move the
    task there, and confirm it is still listed."""
    created = client.post("/api/kanban/tasks", json={
        "customer": "acme",
        "title": "ship it",
        "status": "TODO",
        "tags": [],
    })
    assert created.status_code == 201
    task_id = created.json()["id"]

    added = client.post("/api/settings/states", json={
        "name": "Backlog",
        "label": "Backlog",
        "color": "#444",
    })
    assert added.status_code == 201

    moved = client.patch(
        f"/api/kanban/tasks/{task_id}", json={"status": "Backlog"},
    )
    assert moved.status_code == 200

    tasks = client.get("/api/kanban/tasks?include_done=true").json()
    statuses = {t["id"]: t["status"] for t in tasks}
    assert task_id in statuses, (
        "task moved to the new column vanished — backend "
        "keyword cache was not refreshed"
    )
    assert statuses[task_id] == "Backlog"
