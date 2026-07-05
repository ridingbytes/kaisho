"""API tests for the projects router and per-project file
attachments, using the shared TestClient harness in
``test_api.py`` (KAISHO_HOME isolation fixture)."""
import io

import pytest


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
