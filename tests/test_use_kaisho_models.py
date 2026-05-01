"""Test the ``/api/cloud-sync/use-kaisho-models`` endpoint.

This is the one-click "use Kaisho models everywhere" affordance
behind the Cloud Sync panel button. It must:

- Set ``ai.advisor_model`` to ``kaisho:advisor``
- Set ``ai.cron_model`` to ``kaisho:cron``
- Switch every cron job's ``model`` to ``kaisho:cron``
- Skip jobs that are already on ``kaisho:cron`` (idempotent)
"""
import pytest
import yaml


@pytest.fixture(autouse=True)
def _isolate_env(tmp_path, monkeypatch):
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

    # Seed jobs.yaml with a mix of models
    jobs_file = profile_dir / "jobs.yaml"
    jobs_file.write_text(
        yaml.safe_dump({
            "jobs": [
                {
                    "id": "daily",
                    "name": "Daily",
                    "schedule": "0 8 * * *",
                    "model": "ollama:qwen3:14b",
                    "prompt_file": "p1.md",
                    "output": "inbox",
                    "timeout": 300,
                    "enabled": True,
                },
                {
                    "id": "weekly",
                    "name": "Weekly",
                    "schedule": "0 9 * * 1",
                    "model": "kaisho:cron",
                    "prompt_file": "p2.md",
                    "output": "inbox",
                    "timeout": 300,
                    "enabled": True,
                },
                {
                    "id": "research",
                    "name": "Research",
                    "schedule": "0 10 * * 1",
                    "model": "claude:sonnet-4-6",
                    "prompt_file": "p3.md",
                    "output": "inbox",
                    "timeout": 300,
                    "enabled": True,
                },
            ],
        }),
        encoding="utf-8",
    )
    yield
    reset_config()
    get_backend.cache_clear()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from kaisho.api.app import app
    return TestClient(app, raise_server_exceptions=False)


def test_apply_kaisho_models_switches_all(client):
    r = client.post("/api/cloud-sync/use-kaisho-models")
    assert r.status_code == 200, r.text
    body = r.json()

    # Two jobs needed switching (ollama, claude); one was
    # already on kaisho:cron and counted as no-op.
    assert body["jobs_changed"] == 2
    assert body["advisor_model"] == "kaisho:advisor"
    assert body["cron_model"] == "kaisho:cron"
    assert body["advisor_changed"] is True

    # Verify jobs.yaml: every job is now on kaisho:cron.
    jobs = client.get("/api/cron/jobs").json()
    for job in jobs:
        assert job["model"] == "kaisho:cron"

    # Verify ai settings.
    ai = client.get("/api/settings/ai").json()
    assert ai["advisor_model"] == "kaisho:advisor"
    assert ai["cron_model"] == "kaisho:cron"


def test_apply_kaisho_models_idempotent(client):
    """Calling twice in a row must report 0 changes the
    second time — every job is already on kaisho:cron."""
    client.post("/api/cloud-sync/use-kaisho-models")
    r = client.post("/api/cloud-sync/use-kaisho-models")
    assert r.status_code == 200
    assert r.json()["jobs_changed"] == 0
    assert r.json()["advisor_changed"] is False
