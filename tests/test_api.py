"""API router tests using FastAPI TestClient.

Tests the HTTP layer: status codes, request validation,
response shapes, and error handling. Each test gets a
fresh temporary data directory.
"""
import os
import pytest
from pathlib import Path
from unittest.mock import patch


@pytest.fixture(autouse=True)
def _isolate_env(tmp_path, monkeypatch):
    """Point the app at a temp directory for each test.

    Sets KAISHO_HOME so the config resolves to the
    temp dir. Clears cached singletons between tests.
    """
    data_dir = tmp_path / ".kaisho"
    profile_dir = data_dir / "profiles" / "default"
    profile_dir.mkdir(parents=True)
    org_dir = profile_dir / "org"
    org_dir.mkdir()
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

    yield

    reset_config()
    get_backend.cache_clear()


@pytest.fixture
def client():
    """Create a TestClient for the FastAPI app.

    :returns: ``httpx.Client`` wrapping the app.
    """
    from fastapi.testclient import TestClient
    from kaisho.api.app import app
    return TestClient(app, raise_server_exceptions=False)


# ── Settings ────────────────────────────────────────────


class TestSettings:
    """Tests for GET /api/settings."""

    def test_get_settings(self, client):
        """Returns 200 with required fields."""
        r = client.get("/api/settings")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["task_states"], list)
        assert isinstance(data["tags"], list)
        assert isinstance(data["customer_types"], list)
        assert isinstance(data["inbox_types"], list)
        assert isinstance(data["inbox_channels"], list)

    def test_get_ai_settings(self, client):
        """Returns 200 with AI fields."""
        r = client.get("/api/settings/ai")
        assert r.status_code == 200
        data = r.json()
        assert "ollama_url" in data
        assert "advisor_model" in data

    def test_patch_ai_settings(self, client):
        """Update AI settings returns new values."""
        r = client.patch(
            "/api/settings/ai",
            json={"advisor_model": "ollama:test"},
        )
        assert r.status_code == 200
        assert r.json()["advisor_model"] == "ollama:test"

    def test_get_ai_models(self, client):
        """Returns model list (empty when no providers)."""
        r = client.get("/api/settings/ai/models")
        assert r.status_code == 200
        assert isinstance(r.json()["models"], list)

    def test_get_ai_probe(self, client):
        """Returns probe status for all providers."""
        r = client.get("/api/settings/ai/probe")
        assert r.status_code == 200
        data = r.json()
        for key in ("ollama", "lm_studio", "claude"):
            assert key in data


# ── States & Tags ───────────────────────────────────────


class TestStatesAndTags:
    """Tests for task states and tags CRUD."""

    def test_add_state(self, client):
        """POST /api/settings/states creates a state."""
        r = client.post(
            "/api/settings/states",
            json={
                "name": "WIP",
                "label": "In Progress",
                "color": "#ff0000",
                "done": False,
            },
        )
        assert r.status_code == 201

    def test_add_and_list_tags(self, client):
        """POST then GET settings includes the tag."""
        client.post(
            "/api/settings/tags",
            json={
                "name": "urgent",
                "color": "#ff0000",
                "description": "High priority",
            },
        )
        r = client.get("/api/settings")
        assert r.status_code == 200
        names = [t["name"] for t in r.json()["tags"]]
        assert "urgent" in names

    def test_delete_tag(self, client):
        """DELETE removes a tag."""
        client.post(
            "/api/settings/tags",
            json={
                "name": "temp",
                "color": "",
                "description": "",
            },
        )
        r = client.delete("/api/settings/tags/temp")
        assert r.status_code == 204


# ── Kanban / Tasks ──────────────────────────────────────


class TestKanban:
    """Tests for the kanban/tasks router."""

    def test_list_tasks_empty(self, client):
        """GET /api/kanban/tasks returns empty list."""
        r = client.get("/api/kanban/tasks")
        assert r.status_code == 200
        assert r.json() == []

    def test_create_task(self, client):
        """POST /api/kanban/tasks creates a task."""
        r = client.post(
            "/api/kanban/tasks",
            json={
                "customer": "Acme",
                "title": "Fix bug",
                "status": "TODO",
            },
        )
        assert r.status_code == 201
        data = r.json()
        assert "Fix bug" in data["title"]
        assert "id" in data

    def test_create_and_list(self, client):
        """Created tasks appear in list."""
        client.post(
            "/api/kanban/tasks",
            json={
                "customer": "Acme",
                "title": "Task 1",
            },
        )
        r = client.get("/api/kanban/tasks")
        assert len(r.json()) == 1

    def test_move_task(self, client):
        """PATCH moves task to new status."""
        r = client.post(
            "/api/kanban/tasks",
            json={
                "customer": "Acme",
                "title": "Move me",
                "status": "TODO",
            },
        )
        task_id = r.json()["id"]
        r = client.patch(
            f"/api/kanban/tasks/{task_id}",
            json={"status": "DONE"},
        )
        assert r.status_code == 200

    def test_delete_task(self, client):
        """DELETE removes a task."""
        r = client.post(
            "/api/kanban/tasks",
            json={
                "customer": "Acme",
                "title": "Delete me",
            },
        )
        task_id = r.json()["id"]
        r = client.delete(
            f"/api/kanban/tasks/{task_id}",
        )
        assert r.status_code == 204

    def test_create_missing_title(self, client):
        """POST without title returns 422."""
        r = client.post(
            "/api/kanban/tasks",
            json={"customer": "Acme"},
        )
        assert r.status_code == 422


# ── Clocks ──────────────────────────────────────────────


class TestClocks:
    """Tests for the clocks router."""

    def test_list_entries_empty(self, client):
        """GET /api/clocks/entries returns empty list."""
        r = client.get("/api/clocks/entries")
        assert r.status_code == 200
        assert r.json() == []

    def test_start_and_stop(self, client):
        """Start then stop a timer."""
        r = client.post(
            "/api/clocks/start",
            json={
                "customer": "Acme",
                "description": "Testing",
            },
        )
        assert r.status_code == 201
        assert "start" in r.json()

        r = client.post("/api/clocks/stop")
        assert r.status_code == 200
        assert "end" in r.json()

    def test_active_timer(self, client):
        """GET /api/clocks/active reflects timer state."""
        r = client.get("/api/clocks/active")
        assert r.status_code == 200
        assert r.json()["active"] is False

        client.post(
            "/api/clocks/start",
            json={
                "customer": "Acme",
                "description": "Work",
            },
        )
        r = client.get("/api/clocks/active")
        assert r.json()["active"] is True

    def test_quick_book(self, client):
        """POST /api/clocks/quick-book creates entry."""
        r = client.post(
            "/api/clocks/quick-book",
            json={
                "duration": "1h30m",
                "customer": "Acme",
                "description": "Booked",
            },
        )
        assert r.status_code == 201

        r = client.get("/api/clocks/entries")
        assert len(r.json()) == 1

    def test_ical_feed(self, client):
        """GET /api/clocks/ical returns valid iCal."""
        client.post(
            "/api/clocks/quick-book",
            json={
                "duration": "2h",
                "customer": "Acme",
                "description": "iCal test",
            },
        )
        r = client.get("/api/clocks/calendar.ics")
        assert r.status_code == 200
        assert "BEGIN:VCALENDAR" in r.text


# ── Customers ───────────────────────────────────────────


class TestCustomers:
    """Tests for the customers router."""

    def test_list_empty(self, client):
        """GET /api/customers returns empty list."""
        r = client.get("/api/customers")
        assert r.status_code == 200
        assert r.json() == []

    def test_create_customer(self, client):
        """POST /api/customers creates a customer."""
        r = client.post(
            "/api/customers",
            json={"name": "Acme Corp"},
        )
        assert r.status_code == 201
        assert r.json()["name"] == "Acme Corp"

    def test_duplicate_customer(self, client):
        """Duplicate name returns 409."""
        client.post(
            "/api/customers",
            json={"name": "Acme"},
        )
        r = client.post(
            "/api/customers",
            json={"name": "Acme"},
        )
        assert r.status_code == 409

    def test_add_contract(self, client):
        """POST contract to customer."""
        client.post(
            "/api/customers",
            json={"name": "Acme"},
        )
        r = client.post(
            "/api/customers/Acme/contracts",
            json={
                "name": "Phase 1",
                "budget": 100,
                "start_date": "2026-01-01",
            },
        )
        assert r.status_code == 201


# ── Inbox ───────────────────────────────────────────────


class TestInbox:
    """Tests for the inbox router."""

    def test_list_empty(self, client):
        """GET /api/inbox returns empty list."""
        r = client.get("/api/inbox")
        assert r.status_code == 200
        assert r.json() == []

    def test_capture(self, client):
        """POST /api/inbox/capture creates an item."""
        r = client.post(
            "/api/inbox/capture",
            json={"text": "Remember this"},
        )
        assert r.status_code == 201

        r = client.get("/api/inbox")
        assert len(r.json()) == 1


# ── Notes ───────────────────────────────────────────────


class TestNotes:
    """Tests for the notes router."""

    def test_list_empty(self, client):
        """GET /api/notes returns empty list."""
        r = client.get("/api/notes")
        assert r.status_code == 200
        assert r.json() == []

    def test_create_note(self, client):
        """POST /api/notes creates a note."""
        r = client.post(
            "/api/notes",
            json={
                "title": "Test note",
                "body": "Note body",
            },
        )
        assert r.status_code == 201
        assert r.json()["title"] == "Test note"


# ── Version ─────────────────────────────────────────────


class TestVersion:
    """Tests for the version endpoint."""

    def test_version(self, client):
        """GET /api/version returns version string."""
        r = client.get("/api/version")
        assert r.status_code == 200
        data = r.json()
        assert "version" in data
        assert "changelog" in data


# ── Import ──────────────────────────────────────────────


class TestImport:
    """Tests for the data import endpoint."""

    def test_import_invalid_format(self, client):
        """Rejects unknown format."""
        r = client.post(
            "/api/settings/import-data",
            json={
                "source_format": "xml",
                "source_path": "/tmp",
            },
        )
        assert r.status_code == 400

    def test_import_org(self, client, tmp_path):
        """Imports from an org directory."""
        src = tmp_path / "import_src"
        src.mkdir()
        (src / "todos.org").write_text(
            "* TODO [Test]: Import task\n",
            encoding="utf-8",
        )
        for f in (
            "clocks.org", "customers.org",
            "inbox.org", "notes.org", "archive.org",
        ):
            (src / f).write_text("", encoding="utf-8")

        r = client.post(
            "/api/settings/import-data",
            json={
                "source_format": "org",
                "source_path": str(src),
            },
        )
        assert r.status_code == 200
        summary = r.json()["summary"]
        assert summary["tasks"] >= 1
