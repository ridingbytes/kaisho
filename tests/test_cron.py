"""Tests for the cron service."""
import pytest
import yaml

from kaisho.services.cron import (
    add_job,
    delete_job,
    finish_run,
    get_job,
    list_history,
    list_jobs,
    set_enabled,
    start_run,
    update_job,
)


def _make_job(job_id="test-job", enabled=True):
    return {
        "id": job_id,
        "name": "Test Job",
        "schedule": "0 9 * * 1-5",
        "model": "ollama:qwen3:14b",
        "prompt_file": "prompts/test.md",
        "output": "inbox",
        "timeout": 60,
        "enabled": enabled,
    }


def test_list_jobs_empty(tmp_path):
    jobs_file = tmp_path / "jobs.yaml"
    assert list_jobs(jobs_file) == []


def test_add_job(tmp_path):
    jobs_file = tmp_path / "jobs.yaml"
    job = add_job(jobs_file, _make_job())
    assert job["id"] == "test-job"
    assert list_jobs(jobs_file) == [job]


def test_add_job_duplicate_raises(tmp_path):
    jobs_file = tmp_path / "jobs.yaml"
    add_job(jobs_file, _make_job())
    with pytest.raises(ValueError, match="already exists"):
        add_job(jobs_file, _make_job())


def test_get_job_found(tmp_path):
    jobs_file = tmp_path / "jobs.yaml"
    add_job(jobs_file, _make_job())
    job = get_job(jobs_file, "test-job")
    assert job is not None
    assert job["id"] == "test-job"


def test_get_job_missing(tmp_path):
    jobs_file = tmp_path / "jobs.yaml"
    assert get_job(jobs_file, "nonexistent") is None


def test_update_job(tmp_path):
    jobs_file = tmp_path / "jobs.yaml"
    add_job(jobs_file, _make_job())
    updated = update_job(jobs_file, "test-job", {"timeout": 300})
    assert updated["timeout"] == 300


def test_update_job_missing_raises(tmp_path):
    jobs_file = tmp_path / "jobs.yaml"
    with pytest.raises(ValueError, match="not found"):
        update_job(jobs_file, "ghost", {"timeout": 10})


def test_set_enabled_false(tmp_path):
    jobs_file = tmp_path / "jobs.yaml"
    add_job(jobs_file, _make_job(enabled=True))
    result = set_enabled(jobs_file, "test-job", False)
    assert result["enabled"] is False


def test_delete_job(tmp_path):
    jobs_file = tmp_path / "jobs.yaml"
    add_job(jobs_file, _make_job())
    assert delete_job(jobs_file, "test-job") is True
    assert list_jobs(jobs_file) == []


def test_delete_job_missing(tmp_path):
    jobs_file = tmp_path / "jobs.yaml"
    assert delete_job(jobs_file, "ghost") is False


def test_history_run_lifecycle(db_file):
    run_id = start_run(db_file, "test-job")
    assert isinstance(run_id, int)

    entries = list_history(db_file)
    assert len(entries) == 1
    assert entries[0]["status"] == "running"

    finish_run(db_file, run_id, "ok", output="done")
    entries = list_history(db_file)
    assert entries[0]["status"] == "ok"
    assert entries[0]["output"] == "done"
    assert entries[0]["finished_at"] is not None


def test_history_filter_by_job(db_file):
    start_run(db_file, "job-a")
    start_run(db_file, "job-b")
    entries = list_history(db_file, job_id="job-a")
    assert len(entries) == 1
    assert entries[0]["job_id"] == "job-a"
