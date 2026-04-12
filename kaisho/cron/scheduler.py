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
    mark_stale_runs_crashed,
    start_run,
)
from .executor import ExecutorError, execute_job

# Module-level scheduler instance — set by build_scheduler(),
# used by sync_jobs() so the API can update it without a restart.
_scheduler: BackgroundScheduler | None = None


def _project_root() -> Path:
    return Path(__file__).parent.parent.parent


def _run_job(job: dict) -> None:
    cfg = get_config()
    profile = cfg.PROFILE_DIR
    run_id = start_run(profile, job["id"], job.get("model", ""))
    completed = False
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
        completed = True
    except ExecutorError as exc:
        finish_run(
            profile, run_id, "error", error=str(exc)
        )
        completed = True
    except Exception as exc:
        finish_run(
            profile, run_id, "error", error=str(exc)
        )
        completed = True
        raise
    finally:
        if not completed:
            finish_run(
                profile, run_id, "error",
                error="Interrupted: process terminated unexpectedly",
            )


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


def _add_job_to_scheduler(
    scheduler: BackgroundScheduler, job: dict
) -> None:
    """Add a single enabled job to the live scheduler."""
    try:
        kwargs = _cron_kwargs(job["schedule"])
    except ValueError:
        return
    scheduler.add_job(
        _run_job,
        trigger=CronTrigger(**kwargs),
        args=[job],
        id=job["id"],
        name=job.get("name", job["id"]),
        replace_existing=True,
    )


def build_scheduler(jobs_file: Path) -> BackgroundScheduler:
    """Create, configure, and store the global scheduler."""
    global _scheduler
    cfg = get_config()
    mark_stale_runs_crashed(cfg.PROFILE_DIR)
    _scheduler = BackgroundScheduler()
    jobs = list_jobs(jobs_file)
    for job in jobs:
        if not job.get("enabled", False):
            continue
        _add_job_to_scheduler(_scheduler, job)
    return _scheduler


def sync_jobs(jobs_file: Path) -> None:
    """Re-sync the live scheduler to match jobs.yaml.

    Call this after any job mutation (add/update/enable/disable/
    delete) so changes take effect without a server restart.
    Does nothing if no scheduler has been started yet.
    """
    if _scheduler is None:
        return
    jobs = list_jobs(jobs_file)
    enabled_ids = set()
    for job in jobs:
        if job.get("enabled", False):
            _add_job_to_scheduler(_scheduler, job)
            enabled_ids.add(job["id"])
        else:
            # Remove if it was previously scheduled
            try:
                _scheduler.remove_job(job["id"])
            except Exception:
                pass

    # Remove jobs that no longer exist in YAML
    scheduled_ids = {j.id for j in _scheduler.get_jobs()}
    for job_id in scheduled_ids - enabled_ids:
        try:
            _scheduler.remove_job(job_id)
        except Exception:
            pass
