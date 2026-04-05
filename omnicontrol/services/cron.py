"""Cron job service.

Reads/writes jobs.yaml for job definitions and uses the SQLite
cron_history table for execution records. All business logic lives
here; CLI and API are thin callers.
"""
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from .database import get_db_conn


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _load_yaml(jobs_file: Path) -> dict:
    if not jobs_file.exists():
        return {"jobs": []}
    with open(jobs_file, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {"jobs": []}


def _save_yaml(jobs_file: Path, data: dict) -> None:
    with open(jobs_file, "w", encoding="utf-8") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True)


# ---------------------------------------------------------------------------
# Job CRUD
# ---------------------------------------------------------------------------

def list_jobs(jobs_file: Path) -> list[dict]:
    """Return all job definitions."""
    data = _load_yaml(jobs_file)
    return data.get("jobs", [])


def get_job(jobs_file: Path, job_id: str) -> dict | None:
    """Return a single job definition by id."""
    for job in list_jobs(jobs_file):
        if job["id"] == job_id:
            return job
    return None


def add_job(jobs_file: Path, job: dict) -> dict:
    """Append a new job. Raises ValueError if id already exists."""
    data = _load_yaml(jobs_file)
    jobs = data.get("jobs", [])
    if any(j["id"] == job["id"] for j in jobs):
        raise ValueError(f"job id already exists: {job['id']}")
    jobs.append(job)
    data["jobs"] = jobs
    _save_yaml(jobs_file, data)
    return job


def update_job(jobs_file: Path, job_id: str, updates: dict) -> dict:
    """Update fields on an existing job. Returns updated job."""
    data = _load_yaml(jobs_file)
    jobs = data.get("jobs", [])
    for job in jobs:
        if job["id"] == job_id:
            job.update(updates)
            data["jobs"] = jobs
            _save_yaml(jobs_file, data)
            return job
    raise ValueError(f"job not found: {job_id}")


def delete_job(jobs_file: Path, job_id: str) -> bool:
    """Remove a job by id. Returns False if not found."""
    data = _load_yaml(jobs_file)
    jobs = data.get("jobs", [])
    new_jobs = [j for j in jobs if j["id"] != job_id]
    if len(new_jobs) == len(jobs):
        return False
    data["jobs"] = new_jobs
    _save_yaml(jobs_file, data)
    return True


def set_enabled(jobs_file: Path, job_id: str, enabled: bool) -> dict:
    """Enable or disable a job."""
    return update_job(jobs_file, job_id, {"enabled": enabled})


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

def _row_to_dict(row) -> dict:
    return dict(row)


def list_history(
    db_file: Path,
    job_id: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """Return execution history, most recent first."""
    if job_id:
        query = (
            "SELECT * FROM cron_history WHERE job_id = ? "
            "ORDER BY started_at DESC LIMIT ?"
        )
        params: list[Any] = [job_id, limit]
    else:
        query = (
            "SELECT * FROM cron_history "
            "ORDER BY started_at DESC LIMIT ?"
        )
        params = [limit]
    with get_db_conn(db_file) as conn:
        rows = conn.execute(query, params).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_history_entry(db_file: Path, entry_id: int) -> dict | None:
    """Return a single history record."""
    with get_db_conn(db_file) as conn:
        row = conn.execute(
            "SELECT * FROM cron_history WHERE id = ?", (entry_id,)
        ).fetchone()
    return _row_to_dict(row) if row else None


def delete_history_entry(db_file: Path, entry_id: int) -> bool:
    """Delete a history record. Returns False if not found."""
    with get_db_conn(db_file) as conn:
        cur = conn.execute(
            "DELETE FROM cron_history WHERE id = ?", (entry_id,)
        )
    return cur.rowcount > 0


def start_run(db_file: Path, job_id: str) -> int:
    """Insert a 'running' history record. Returns its row id."""
    with get_db_conn(db_file) as conn:
        cursor = conn.execute(
            "INSERT INTO cron_history (job_id, started_at, status) "
            "VALUES (?, ?, 'running')",
            (job_id, _now_iso()),
        )
        conn.commit()
    return cursor.lastrowid


def finish_run(
    db_file: Path,
    run_id: int,
    status: str,
    output: str = "",
    error: str = "",
) -> None:
    """Update a history record after execution completes."""
    with get_db_conn(db_file) as conn:
        conn.execute(
            "UPDATE cron_history "
            "SET finished_at = ?, status = ?, output = ?, error = ? "
            "WHERE id = ?",
            (_now_iso(), status, output, error, run_id),
        )
        conn.commit()
