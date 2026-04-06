"""APScheduler-based cron runner.

Loads job definitions from jobs.yaml and schedules enabled jobs.
Each job is executed via cron/executor.py and history is written
to cron_history.json in the profile directory.
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
    profile = cfg.PROFILE_DIR
    run_id = start_run(profile, job["id"])
    try:
        from ..services.settings import (
            get_ai_settings, load_settings,
        )
        ai = get_ai_settings(
            load_settings(cfg.SETTINGS_FILE)
        )
        output = execute_job(
            job,
            project_root=_project_root(),
            ollama_base_url=ai["ollama_url"],
            lm_studio_base_url=ai.get(
                "lm_studio_url", ""
            ),
            claude_api_key=ai.get("claude_api_key", ""),
            openrouter_base_url=ai.get(
                "openrouter_url", ""
            ),
            openrouter_api_key=ai.get(
                "openrouter_api_key", ""
            ),
            openai_base_url=ai.get("openai_url", ""),
            openai_api_key=ai.get("openai_api_key", ""),
        )
        finish_run(
            profile, run_id, "ok", output=output[:4000]
        )
    except ExecutorError as exc:
        finish_run(
            profile, run_id, "error", error=str(exc)
        )
    except Exception as exc:
        finish_run(
            profile, run_id, "error", error=str(exc)
        )
        raise


def _cron_kwargs(schedule: str) -> dict:
    """Parse a 5-field cron string into APScheduler kwargs."""
    fields = schedule.strip().split()
    if len(fields) != 5:
        raise ValueError(
            f"invalid cron schedule: {schedule!r}"
        )
    minute, hour, day, month, day_of_week = fields
    return {
        "minute": minute,
        "hour": hour,
        "day": day,
        "month": month,
        "day_of_week": day_of_week,
    }


def build_scheduler(jobs_file: Path) -> BackgroundScheduler:
    """Create and return a configured scheduler."""
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
