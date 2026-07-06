"""API tests for the projects router and per-project file
attachments."""
import io

import pytest


@pytest.fixture(autouse=True)
def _isolate_env(tmp_path, monkeypatch):
    """Point the app at a temp directory for each test so
    projects/tasks/files never touch the real profile."""
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
    yield
    reset_config()
    get_backend.cache_clear()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from kaisho.api.app import app
    return TestClient(app, raise_server_exceptions=False)


def test_project_crud_and_milestones(client):
    # Create
    r = client.post("/api/projects", json={
        "name": "Website", "customer": "ACME",
        "description": "Rebuild",
    })
    assert r.status_code == 201
    proj = r.json()
    pid = proj["id"]
    assert proj["name"] == "Website"
    assert proj["status"] == "ACTIVE"

    # List
    r = client.get("/api/projects")
    assert r.status_code == 200
    assert any(p["id"] == pid for p in r.json())

    # Milestone add + toggle
    r = client.post(
        f"/api/projects/{pid}/milestones",
        json={"title": "Kickoff"},
    )
    assert r.status_code == 201
    mid = r.json()["id"]
    r = client.patch(
        f"/api/projects/{pid}/milestones/{mid}",
        json={"done": True},
    )
    assert r.json()["done"] is True

    r = client.get(f"/api/projects/{pid}")
    assert r.json()["milestones"][0]["done"] is True


def test_assign_task_and_aggregate(client):
    pid = client.post("/api/projects", json={
        "name": "P", "customer": "ACME",
    }).json()["id"]

    task = client.post("/api/kanban/tasks", json={
        "customer": "ACME", "title": "Do work",
        "project": pid,
    }).json()
    assert task["project"] == pid

    r = client.get(f"/api/projects/{pid}/aggregate")
    assert r.status_code == 200
    agg = r.json()
    assert len(agg["tasks"]) == 1
    assert agg["tasks"][0]["id"] == task["id"]

    # Unassign clears it from the aggregate.
    client.patch(
        f"/api/kanban/tasks/{task['id']}",
        json={"project": ""},
    )
    agg = client.get(
        f"/api/projects/{pid}/aggregate",
    ).json()
    assert agg["tasks"] == []


def test_project_files_upload_list_delete(client):
    pid = client.post(
        "/api/projects", json={"name": "P"},
    ).json()["id"]

    # Upload a file into the project bucket.
    r = client.post(
        "/api/attachments",
        files={"file": ("spec.txt", io.BytesIO(b"hi"),
                        "text/plain")},
        data={"task_id": pid},
    )
    assert r.status_code == 200
    stored = r.json()["url"].split("/")[-1]

    # List the bucket.
    r = client.get(f"/api/attachments/{pid}")
    assert r.status_code == 200
    files = r.json()["files"]
    assert len(files) == 1
    assert files[0]["display"] == "spec.txt"

    # Delete it.
    r = client.delete(f"/api/attachments/{pid}/{stored}")
    assert r.status_code == 204
    assert client.get(
        f"/api/attachments/{pid}",
    ).json()["files"] == []


def test_mcp_project_tools():
    from kaisho.cron.tools import execute_tool
    from kaisho.backends import get_backend

    added = execute_tool(
        "add_project", {"name": "Alpha", "customer": "ACME"},
    )
    pid = added["project"]["id"]

    listed = execute_tool("list_projects", {})
    assert any(p["id"] == pid for p in listed["projects"])

    execute_tool(
        "add_project_milestone",
        {"project_id": pid, "title": "M1"},
    )

    task = get_backend().tasks.add_task(
        customer="ACME", title="T",
    )
    execute_tool(
        "assign_task_to_project",
        {"task_id": task["id"], "project_id": pid},
    )
    agg = execute_tool("get_project", {"project_id": pid})
    assert len(agg["tasks"]) == 1
    assert agg["project"]["milestones"][0]["title"] == "M1"


def test_project_file_text_read_and_replace(client):
    pid = client.post(
        "/api/projects", json={"name": "P"},
    ).json()["id"]
    r = client.post(
        "/api/attachments",
        files={"file": ("note.md", io.BytesIO(b"# Hi"),
                        "text/markdown")},
        data={"task_id": pid},
    )
    stored = r.json()["url"].split("/")[-1]

    # Read raw text.
    r = client.get(f"/api/attachments/{pid}/{stored}/raw")
    assert r.status_code == 200
    assert r.json()["content"] == "# Hi"

    # Replace in place.
    r = client.put(
        f"/api/attachments/{pid}/{stored}",
        json={"content": "# Edited\n\nbody"},
    )
    assert r.status_code == 200
    r = client.get(f"/api/attachments/{pid}/{stored}/raw")
    assert r.json()["content"] == "# Edited\n\nbody"


def test_dashboard_lists_active_projects(client):
    pid = client.post(
        "/api/projects", json={"name": "Alpha"},
    ).json()["id"]
    data = client.get("/api/dashboard").json()
    cards = data.get("projects", [])
    assert any(p["id"] == pid for p in cards)


def test_delete_project(client):
    pid = client.post(
        "/api/projects", json={"name": "Temp"},
    ).json()["id"]
    assert client.delete(
        f"/api/projects/{pid}",
    ).status_code == 204
    assert client.get(
        f"/api/projects/{pid}",
    ).status_code == 404
