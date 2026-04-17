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
            get_ai_settings,
            get_cloud_sync_key,
            get_cloud_sync_settings,
            load_settings,
        )
        data = load_settings(cfg.SETTINGS_FILE)
        ai = get_ai_settings(data)
        sync = data.get("cloud_sync", {})
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
            cloud_url=sync.get("url", ""),
            cloud_api_key=get_cloud_sync_key(data),
            use_cloud_ai=bool(
                sync.get("use_cloud_ai"),
            ),
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


def _run_backup() -> None:
    """Periodic backup job. No-op when disabled."""
    from ..services import backup as backup_svc
    from ..services import settings as settings_svc

    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    backup_cfg = settings_svc.get_backup_settings(data)
    if backup_cfg.get("interval_hours", 0) <= 0:
        return
    target = settings_svc.resolve_backup_dir(data, cfg)
    try:
        backup_svc.create_backup(
            source_dir=cfg.DATA_DIR,
            backup_dir=target,
            profile=cfg.PROFILE,
        )
    except Exception as exc:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).warning(
            "Scheduled backup failed: %s", exc,
        )
        return
    keep = backup_cfg.get("keep", 0)
    if keep > 0:
        backup_svc.prune_backups(target, keep)


_BACKUP_JOB_ID = "__backup__"


def _backup_trigger():
    """Return an APScheduler trigger for the backup job
    based on the configured interval, or None if disabled."""
    from apscheduler.triggers.interval import IntervalTrigger
    from ..services import settings as settings_svc

    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    hours = settings_svc.get_backup_settings(data).get(
        "interval_hours", 0,
    )
    if hours <= 0:
        return None
    return IntervalTrigger(hours=hours)


def sync_backup_job() -> None:
    """Refresh the backup schedule after settings change."""
    if _scheduler is None:
        return
    trigger = _backup_trigger()
    if trigger is None:
        try:
            _scheduler.remove_job(_BACKUP_JOB_ID)
        except Exception:
            pass
        return
    _scheduler.add_job(
        _run_backup,
        trigger=trigger,
        id=_BACKUP_JOB_ID,
        name="Backup",
        replace_existing=True,
    )


def _on_cloud_ws_event(
    event: str, data: dict,
) -> None:
    """Handle real-time events from the cloud WebSocket.

    Triggers an immediate sync cycle for data changes
    and broadcasts timer events to the local WebSocket
    so the frontend updates instantly.
    """
    import logging
    log = logging.getLogger(__name__)
    log.info("Cloud WS event: %s", event)

    if event in ("entries:changed", "entries:deleted"):
        # Trigger immediate sync instead of waiting
        # for the 15-minute fallback
        _run_cloud_sync()

    if event in ("timer:started", "timer:stopped"):
        # Broadcast to local WebSocket so the desktop
        # UI updates the cloud timer widget instantly
        try:
            from ..api.ws.manager import broadcast
            broadcast({
                "resource": "clocks",
                "type": event,
                "data": data,
            })
        except Exception:
            pass


def _start_cloud_ws_if_enabled() -> None:
    """Start the cloud WS client if sync is configured."""
    from ..services import settings as settings_svc

    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    sync = data.get("cloud_sync", {})
    if not sync.get("enabled"):
        return

    url = sync.get("url", "")
    key = sync.get("api_key", "")
    if not url or not key:
        return

    from ..services.cloud_ws import start_cloud_ws
    start_cloud_ws(url, key, _on_cloud_ws_event)


def _run_cloud_sync() -> None:
    """Periodic cloud sync job. No-op when disabled."""
    from ..services import settings as settings_svc
    from ..services import cloud_sync as sync_svc
    from ..backends import get_backend

    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    sync = data.get("cloud_sync", {})
    if not sync.get("enabled"):
        return

    url = sync.get("url", "")
    key = sync.get("api_key", "")
    if not url or not key:
        return

    backend = get_backend()
    sync_svc.run_sync_cycle(
        cloud_url=url,
        api_key=key,
        profile_dir=cfg.PROFILE_DIR,
        clocks_file=backend.clocks.data_file,
        customers_fn=backend.customers.list_customers,
        tasks_fn=lambda: backend.tasks.list_tasks(
            include_done=False,
        ),
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

    # Cloud sync — runs every 15 minutes as fallback.
    # Real-time sync is handled by the cloud WebSocket.
    _scheduler.add_job(
        _run_cloud_sync,
        "interval",
        minutes=15,
        id="__cloud_sync__",
        name="Cloud Sync",
        replace_existing=True,
    )

    # Start cloud WebSocket for real-time sync events
    _start_cloud_ws_if_enabled()

    # Recurring tasks — runs daily at 06:00.
    _scheduler.add_job(
        _run_recurring_tasks,
        trigger=CronTrigger(hour=6, minute=0),
        id="__recurring_tasks__",
        name="Recurring Tasks",
        replace_existing=True,
    )

    # Periodic backup job (gated on interval_hours > 0).
    trigger = _backup_trigger()
    if trigger is not None:
        _scheduler.add_job(
            _run_backup,
            trigger=trigger,
            id=_BACKUP_JOB_ID,
            name="Backup",
            replace_existing=True,
        )

    return _scheduler


def _run_recurring_tasks() -> None:
    """Create new task instances for due recurring tasks."""
    from ..services.recurring_tasks import (
        process_recurring_tasks,
    )
    from ..backends import get_backend

    try:
        backend = get_backend()
        created = process_recurring_tasks(backend)
        if created:
            import logging
            logging.getLogger(__name__).info(
                "Recurring tasks: created %d", created,
            )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "Recurring tasks failed: %s", exc,
        )


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

    # Remove user jobs that no longer exist in YAML.
    # System jobs (prefixed with __) must be preserved.
    scheduled_ids = {j.id for j in _scheduler.get_jobs()}
    for job_id in scheduled_ids - enabled_ids:
        if job_id.startswith("__"):
            continue
        try:
            _scheduler.remove_job(job_id)
        except Exception:
            pass
