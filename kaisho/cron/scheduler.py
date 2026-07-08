"""APScheduler-based cron runner.

Loads job definitions from jobs.yaml and schedules enabled
jobs. Each job is executed via cron/executor.py and history
is written to cron_history.json in the profile directory.
"""
import logging
import threading
import time
from datetime import datetime
from pathlib import Path

from apscheduler.jobstores.base import JobLookupError
from apscheduler.schedulers.background import (
    BackgroundScheduler,
)
from apscheduler.triggers.cron import CronTrigger

from ..config import get_config
from ..services.cron import (
    finish_run,
    list_jobs,
    mark_stale_runs_crashed,
    start_run,
)
from .executor import (
    ExecutorError, execute_job, resolve_model_label,
)

# Module-level scheduler instance — set by build_scheduler(),
# used by sync_jobs() so the API can update it without a restart.
_scheduler: BackgroundScheduler | None = None


def _project_root() -> Path:
    return Path(__file__).parent.parent.parent


def _run_job(job: dict) -> None:
    cfg = get_config()
    profile = cfg.PROFILE_DIR
    from ..services.settings import (
        get_ai_settings,
        get_cloud_sync_key,
        load_settings,
    )
    data = load_settings(cfg.SETTINGS_FILE)
    ai = get_ai_settings(data)
    sync = data.get("cloud_sync", {})
    cloud_url = sync.get("url", "")
    cloud_api_key = get_cloud_sync_key(data)
    model_label = resolve_model_label(job)
    run_id = start_run(profile, job["id"], model_label)
    completed = False
    try:
        output = execute_job(
            job,
            project_root=_project_root(),
            ollama_base_url=ai["ollama_url"],
            ollama_api_key=ai.get(
                "ollama_api_key", "",
            ),
            ollama_cloud_url=ai.get(
                "ollama_cloud_url", "",
            ),
            ollama_cloud_api_key=ai.get(
                "ollama_cloud_api_key", "",
            ),
            lm_studio_base_url=ai.get(
                "lm_studio_url", "",
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
            cloud_url=cloud_url,
            cloud_api_key=cloud_api_key,
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
    except Exception as exc:  # noqa: BLE001
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
        except JobLookupError:
            pass
        return
    _scheduler.add_job(
        _run_backup,
        trigger=trigger,
        id=_BACKUP_JOB_ID,
        name="Backup",
        replace_existing=True,
    )


_ws_log = logging.getLogger(__name__ + ".ws")
_sync_log = logging.getLogger(__name__ + ".sync")

_ws_sync_pending = False
_ws_sync_lock = threading.Lock()

# Frontend resource keys the React side knows how to
# invalidate (see ``frontend/src/hooks/useWebSocket.ts``
# ``RESOURCE_TO_QUERY``). The tasks query is routed via
# the ``kanban`` key there, so ``tasks`` (the obvious
# name) would be a silent no-op — that exact trap got
# missed for months, hence the comment-and-constant.
# Single source of truth so the periodic-poller broadcast
# and any future per-resource trigger stay in lock-step.
BROADCAST_RESOURCES = ("clocks", "inbox", "kanban", "notes")

# Cloud-WS event names that warrant a debounced sync.
# Mapped to the resource purely for documentation / for
# any consumer that needs the affinity; the broadcast
# itself is now blanket via ``BROADCAST_RESOURCES`` so
# every WS-triggered cycle refreshes everything that
# matters.
#
# ``timer:started`` covers two cases that both need a
# pull: a brand-new timer started on another device, and
# a stopped entry's timer restarted on another device
# (the cloud emits ``timer:started`` because the entry's
# end is cleared).
_WS_EVENT_TO_RESOURCE = {
    "entries:changed": "clocks",
    "entries:deleted": "clocks",
    "timer:started": "clocks",
    "timer:stopped": "clocks",
    "inbox:changed": "inbox",
    "tasks:changed": "kanban",
    "notes:changed": "notes",
}


def _debounced_sync() -> None:
    """Run a sync if one is pending, with dedup.

    Waits 2 seconds to coalesce rapid events into a
    single sync cycle, then calls ``_run_cloud_sync`` —
    which in turn fires ``_broadcast_sync_changes`` on
    success so the frontend's React Query cache lands
    *after* the new rows are in local SQL. Errors are
    logged, not raised.
    """
    global _ws_sync_pending
    time.sleep(2)
    with _ws_sync_lock:
        if not _ws_sync_pending:
            return
        _ws_sync_pending = False
    try:
        _run_cloud_sync()
    except Exception:  # noqa: BLE001
        _ws_log.warning(
            "WS-triggered sync failed", exc_info=True,
        )


def _schedule_ws_sync() -> None:
    """Schedule a debounced sync from a WS event.

    If a sync is already pending, this is a no-op
    (the pending sync will pick up the new changes).
    """
    global _ws_sync_pending
    with _ws_sync_lock:
        if _ws_sync_pending:
            return
        _ws_sync_pending = True
    threading.Thread(
        target=_debounced_sync,
        daemon=True,
        name="cloud-ws-sync",
    ).start()


def _on_cloud_ws_event(
    event: str, data: dict,
) -> None:
    """Handle real-time events from the cloud WebSocket.

    Timer events fire an immediate ``clocks`` broadcast so
    the running-timer card flashes the new state without
    waiting for the 2-second sync debounce — the data
    might still be stale when the frontend refetches, but
    the visual cue is worth it.

    Any event in ``_WS_EVENT_TO_RESOURCE`` schedules a
    debounced sync; the eventual ``_run_cloud_sync`` call
    will broadcast all resources via
    ``_broadcast_sync_changes`` once the pull lands.
    """
    _ws_log.info("Cloud WS event: %s", event)

    # Timer events: immediate broadcast for instant UI cue
    if event in ("timer:started", "timer:stopped"):
        try:
            from ..api.ws.manager import broadcast_sync
            broadcast_sync({
                "resource": "clocks",
                "type": event,
                "data": data,
            })
        except Exception:  # noqa: BLE001
            _ws_log.warning(
                "Failed to broadcast timer event",
                exc_info=True,
            )

    # Data changes trigger a debounced sync; the broadcast
    # piggybacks on ``_broadcast_sync_changes`` once the
    # cycle writes new rows to local SQL.
    if event in _WS_EVENT_TO_RESOURCE:
        _schedule_ws_sync()


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


def restart_cloud_ws() -> None:
    """Restart the cloud WebSocket for the active profile.

    Called on profile switch so the WS connection uses
    the new profile's cloud credentials.
    """
    from ..services.cloud_ws import stop_cloud_ws
    stop_cloud_ws()
    _start_cloud_ws_if_enabled()


def _broadcast_sync_changes(result: dict) -> None:
    """Notify the desktop frontend after a sync cycle.

    Broadcasts a refresh event for each resource so the UI
    updates without a manual reload. Over-broadcasts all
    resources because the ``result`` dict only carries
    aggregate counts — sending all four is safe (a few
    extra React Query refetches at most).

    Resource names must match the keys in
    ``frontend/src/hooks/useWebSocket.ts``'s
    ``RESOURCE_TO_QUERY`` — the tasks query is routed via
    the ``kanban`` key there, so ``tasks`` (the obvious
    name) would be a silent no-op.

    No ``pulled+deleted == 0`` gate: a zero-count result is
    not proof that nothing changed — cursor races,
    push-lock contention, and partial-success cycles can
    all produce zero counts even when remote state has
    moved. The cost of always broadcasting is a couple of
    extra refetches when the result really is empty, which
    is cheaper than the user staring at stale data after a
    cycle the gate quietly swallowed.
    """
    from ..api.ws.manager import broadcast_sync
    for resource in BROADCAST_RESOURCES:
        try:
            broadcast_sync({
                "resource": resource,
                "type": "sync:updated",
            })
        except Exception:  # noqa: BLE001
            _ws_log.warning(
                "Failed to broadcast %s sync",
                resource, exc_info=True,
            )


def _run_cloud_sync() -> None:
    """Periodic cloud sync for all enabled profiles.

    Iterates every profile that has cloud sync enabled
    and runs a full sync cycle. Errors in one profile
    do not block the others.

    Only the active profile broadcasts UI refresh
    events (inactive profiles have no visible frontend).
    """
    from ..config import list_profiles
    from ..services import settings as settings_svc
    from ..services import cloud_sync as sync_svc
    from ..backends import (
        get_backend, make_backend_for_profile,
    )

    cfg = get_config()
    active = cfg.PROFILE

    for name in list_profiles(cfg):
        profile_dir = (
            cfg.DATA_DIR / "profiles" / name
        )
        settings_file = profile_dir / "settings.yaml"
        if not settings_file.exists():
            continue
        data = settings_svc.load_settings(
            settings_file,
        )
        sync = data.get("cloud_sync", {})
        if not sync.get("enabled"):
            continue

        url = sync.get("url", "")
        key = sync.get("api_key", "")
        if not url or not key:
            continue

        is_active = (name == active)
        if is_active:
            backend = get_backend()
        else:
            backend = make_backend_for_profile(
                cfg.DATA_DIR, name,
            )

        # For the active profile, acquire the push lock
        # to avoid overlapping with the eager push
        # triggered by local mutations.
        lock_held = False
        if is_active:
            if not sync_svc.try_acquire_push_lock():
                continue
            lock_held = True

        try:
            result = sync_svc.run_sync_cycle(
                cloud_url=url,
                api_key=key,
                profile_dir=profile_dir,
                customers_fn=(
                    backend.customers.list_customers
                ),
                tasks_fn=lambda b=backend: (
                    b.tasks.list_tasks(
                        include_done=False,
                    )
                ),
                backend=backend,
                settings_file=settings_file,
            )
            if is_active:
                _broadcast_sync_changes(result)
        except Exception:  # noqa: BLE001
            _sync_log.warning(
                "Cloud sync failed for profile %s",
                name, exc_info=True,
            )
        finally:
            if lock_held:
                sync_svc.release_push_lock()


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

    # Cloud sync — runs every 5 minutes. The cloud WS
    # triggers immediate sync on data changes; this is
    # the polling fallback.
    #
    # ``next_run_time=now`` fires the first sync as soon
    # as the scheduler starts. Without it, APScheduler
    # waits a full interval before the initial run, so a
    # fresh app launch shows up to five minutes of stale
    # state (e.g. a running timer started on another
    # device while the desktop was offline). The cloud
    # WebSocket only delivers events from the moment it
    # connects, so it cannot fill that gap on its own.
    #
    # APScheduler's BackgroundScheduler is tz-aware;
    # feeding it a naive ``datetime.now()`` triggers
    # ``PytzUsageWarning`` and, on some platforms, refuses
    # to schedule. Use the scheduler's own timezone so the
    # kick-off datetime always matches.
    _scheduler.add_job(
        _run_cloud_sync,
        "interval",
        minutes=5,
        next_run_time=datetime.now(_scheduler.timezone),
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
            logging.getLogger(__name__).info(
                "Recurring tasks: created %d", created,
            )
    except Exception as exc:  # noqa: BLE001
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
            except Exception:  # noqa: BLE001
                pass

    # Remove user jobs that no longer exist in YAML.
    # System jobs (prefixed with __) must be preserved.
    scheduled_ids = {j.id for j in _scheduler.get_jobs()}
    for job_id in scheduled_ids - enabled_ids:
        if job_id.startswith("__"):
            continue
        try:
            _scheduler.remove_job(job_id)
        except JobLookupError:
            pass
