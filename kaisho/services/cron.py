"""Cron job service.

Reads/writes jobs.yaml for job definitions and cron_history.json
for execution records. All business logic lives here; CLI and API
are thin callers.
"""
import json
import tempfile
from pathlib import Path

import yaml

from ..time_utils import local_now_iso


def _now_iso() -> str:
    return local_now_iso(timespec="seconds")


def _load_yaml(jobs_file: Path) -> dict:
    if not jobs_file.exists():
        return {"jobs": []}
    with open(jobs_file, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {"jobs": []}


def _save_yaml(jobs_file: Path, data: dict) -> None:
    with open(jobs_file, "w", encoding="utf-8") as f:
        yaml.dump(
            data, f,
            default_flow_style=False, allow_unicode=True,
        )


# -------------------------------------------------------------------
# Job CRUD
# -------------------------------------------------------------------

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
    """Append a new job. Raises ValueError if id exists."""
    data = _load_yaml(jobs_file)
    jobs = data.get("jobs", [])
    if any(j["id"] == job["id"] for j in jobs):
        raise ValueError(f"job id already exists: {job['id']}")
    jobs.append(job)
    data["jobs"] = jobs
    _save_yaml(jobs_file, data)
    return job


def update_job(
    jobs_file: Path, job_id: str, updates: dict
) -> dict:
    """Update fields on an existing job."""
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


def set_enabled(
    jobs_file: Path, job_id: str, enabled: bool
) -> dict:
    """Enable or disable a job."""
    return update_job(jobs_file, job_id, {"enabled": enabled})


# -------------------------------------------------------------------
# History (JSON file)
# -------------------------------------------------------------------

def _history_file(profile_dir: Path) -> Path:
    return profile_dir / "cron_history.json"


def _load_history(profile_dir: Path) -> list[dict]:
    path = _history_file(profile_dir)
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def _save_history(
    profile_dir: Path, records: list[dict]
) -> None:
    path = _history_file(profile_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(
        dir=path.parent, suffix=".tmp"
    )
    try:
        with open(fd, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2, ensure_ascii=False)
            f.write("\n")
        Path(tmp).replace(path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def _next_id(records: list[dict]) -> int:
    if not records:
        return 1
    return max(r.get("id", 0) for r in records) + 1


def list_history(
    profile_dir: Path,
    job_id: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """Return execution history, most recent first."""
    records = _load_history(profile_dir)
    if job_id:
        records = [
            r for r in records if r.get("job_id") == job_id
        ]
    records.sort(
        key=lambda r: r.get("started_at", ""), reverse=True
    )
    return records[:limit]


def get_history_entry(
    profile_dir: Path, entry_id: int
) -> dict | None:
    """Return a single history record."""
    for r in _load_history(profile_dir):
        if r.get("id") == entry_id:
            return r
    return None


def delete_history_entry(
    profile_dir: Path, entry_id: int
) -> bool:
    """Delete a history record."""
    records = _load_history(profile_dir)
    new = [r for r in records if r.get("id") != entry_id]
    if len(new) == len(records):
        return False
    _save_history(profile_dir, new)
    return True


def start_run(profile_dir: Path, job_id: str) -> int:
    """Insert a 'running' history record. Returns its id."""
    records = _load_history(profile_dir)
    rid = _next_id(records)
    records.append({
        "id": rid,
        "job_id": job_id,
        "started_at": _now_iso(),
        "finished_at": None,
        "status": "running",
        "output": "",
        "error": "",
    })
    _save_history(profile_dir, records)
    return rid


def finish_run(
    profile_dir: Path,
    run_id: int,
    status: str,
    output: str = "",
    error: str = "",
) -> None:
    """Update a history record after execution completes."""
    records = _load_history(profile_dir)
    for r in records:
        if r.get("id") == run_id:
            r["finished_at"] = _now_iso()
            r["status"] = status
            r["output"] = output
            r["error"] = error
            break
    _save_history(profile_dir, records)
