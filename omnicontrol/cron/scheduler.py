"""APScheduler-based cron runner.

Loads job definitions from jobs.yaml and schedules enabled jobs.
Each job is executed via cron/executor.py and history is written
to the SQLite cron_history table.
"""
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from ..config import get_config
from ..services.cron import (
    finish_run,
    list_jobs,
    start_run,
)
from .executor import ExecutorError, execute_job


def _project_root() -> Path:
    return Path(__file__).parent.parent.parent


def _run_job(job: dict) -> None:
    cfg = get_config()
    run_id = start_run(cfg.DB_FILE, job["id"])
    try:
        output = execute_job(
            job,
            project_root=_project_root(),
            ollama_base_url=cfg.OLLAMA_BASE_URL,
            inbox_file=cfg.INBOX_FILE,
        )
        finish_run(cfg.DB_FILE, run_id, "ok", output=output[:4000])
    except ExecutorError as exc:
        finish_run(cfg.DB_FILE, run_id, "error", error=str(exc))
    except Exception as exc:
        finish_run(cfg.DB_FILE, run_id, "error", error=str(exc))
        raise


def _cron_kwargs(schedule: str) -> dict:
    """Parse a 5-field cron string into APScheduler kwargs."""
    fields = schedule.strip().split()
    if len(fields) != 5:
        raise ValueError(f"invalid cron schedule: {schedule!r}")
    minute, hour, day, month, day_of_week = fields
    return {
        "minute": minute,
        "hour": hour,
        "day": day,
        "month": month,
        "day_of_week": day_of_week,
    }


def build_scheduler(jobs_file: Path) -> BackgroundScheduler:
    """Create and return a configured (not yet started) scheduler."""
    scheduler = BackgroundScheduler()
    jobs = list_jobs(jobs_file)
    for job in jobs:
        if not job.get("enabled", False):
            continue
        kwargs = _cron_kwargs(job["schedule"])
        scheduler.add_job(
            _run_job,
            trigger=CronTrigger(**kwargs),
            args=[job],
            id=job["id"],
            name=job.get("name", job["id"]),
            replace_existing=True,
        )
    return scheduler
