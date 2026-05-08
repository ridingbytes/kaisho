"""Per-session safety guards for tool execution.

Both the advisor (``kaisho/services/advisor.py``) and the
cron executor (``kaisho/cron/executor.py``) call AI tools
in an agentic loop. Without bounds, a single misbehaving
or prompt-injected response could:

* Mass-delete data via ``delete_*`` tools.
* Mass-duplicate KB files via repeated
  ``write_kb_file`` calls.
* Silently overwrite existing KB files with new content
  the user never approved.
* Run for many turns hitting writes without any undo
  affordance if something goes wrong.

This module centralises the defences so cron and advisor
share one implementation:

* Per-session **write counter** with a hard cap.
* Separate, tighter cap for ``write_kb_file`` so other
  benign writes (add_task, add_note) don't eat the KB
  budget.
* **Automatic snapshot** before the first write of a
  session, throttled across sessions so we don't spam
  the backup directory.

The state is kept in :class:`threading.local` so every
agentic run gets an isolated counter. Each request handler
spawns its own worker thread (FastAPI threadpool, cron
scheduler, MCP server), so no cross-talk is possible.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta

log = logging.getLogger(__name__)


MAX_WRITES_PER_RUN = 5
MAX_KB_WRITES_PER_RUN = 3
AUTO_SNAPSHOT_INTERVAL = timedelta(minutes=10)


_KB_WRITE_TOOLS = frozenset({"write_kb_file"})

_thread_state = threading.local()
_module_lock = threading.Lock()
_last_auto_snapshot: datetime | None = None


def reset_session() -> None:
    """Reset the counters for the current thread.

    Callers (advisor / cron executor) must invoke this at
    the start of each agentic run so leftover counts from
    a previous run on the same worker thread don't leak.
    """
    _thread_state.writes = 0
    _thread_state.kb_writes = 0
    _thread_state.snapshotted = False


def _writes() -> int:
    return getattr(_thread_state, "writes", 0)


def _kb_writes() -> int:
    return getattr(_thread_state, "kb_writes", 0)


def _snapshotted() -> bool:
    return getattr(_thread_state, "snapshotted", False)


def check_caps(name: str, tier: str) -> dict | None:
    """Return an error dict when a cap is exceeded, else
    ``None``. ``tier`` is one of ``read | write |
    destructive``; only non-read tools count towards the
    write budgets.

    Bumps the counters as a side effect so each tool call
    is counted exactly once, immediately before it runs.
    """
    if tier == "read":
        return None
    _thread_state.writes = _writes() + 1
    if _writes() > MAX_WRITES_PER_RUN:
        return {
            "error": (
                f"Write limit reached "
                f"({MAX_WRITES_PER_RUN} per run). "
                "Stop and report to the user."
            ),
        }
    if name in _KB_WRITE_TOOLS:
        _thread_state.kb_writes = _kb_writes() + 1
        if _kb_writes() > MAX_KB_WRITES_PER_RUN:
            return {
                "error": (
                    f"Knowledge-base write limit reached "
                    f"({MAX_KB_WRITES_PER_RUN} per run). "
                    "Stop and report to the user."
                ),
            }
    return None


def maybe_auto_snapshot(name: str, tier: str) -> None:
    """Take a backup before the first write of a session.

    Throttled to once every ``AUTO_SNAPSHOT_INTERVAL``
    across the whole process so a busy user doesn't
    accumulate dozens of near-identical archives. If the
    snapshot fails the per-session ``snapshotted`` flag
    is left clear so the next non-read tool call retries
    -- otherwise a misconfigured backup dir would silently
    let the rest of the session write without protection.

    ``create_backup`` itself is exempted to avoid
    recursion.
    """
    if tier == "read":
        return
    if name == "create_backup":
        return
    if _snapshotted():
        return
    if not _claim_throttle_slot():
        # Within the throttle window -- a previous
        # session's snapshot already covers us.
        _thread_state.snapshotted = True
        return
    if _take_snapshot():
        _thread_state.snapshotted = True
    else:
        # Roll back the throttle slot we just reserved
        # so the next non-read tool call retries instead
        # of being silently locked out for 10 minutes.
        _release_throttle_slot()


def _release_throttle_slot() -> None:
    """Clear the global throttle timestamp so the next
    snapshot attempt fires immediately. Called when
    ``_take_snapshot`` returns False so a misconfigured
    backup dir doesn't lock the door for 10 minutes."""
    global _last_auto_snapshot
    with _module_lock:
        _last_auto_snapshot = None


def _claim_throttle_slot() -> bool:
    """Reserve the next throttle slot if one is free.

    Returns True when the caller should run a snapshot,
    False when the global throttle is still active. The
    lock guards the timestamp read+write but is released
    BEFORE :func:`_take_snapshot` runs -- holding a lock
    over a multi-second zip write would serialise every
    concurrent advisor session behind one backup.
    """
    global _last_auto_snapshot
    with _module_lock:
        now = datetime.now()
        if (
            _last_auto_snapshot is not None
            and now - _last_auto_snapshot
            <= AUTO_SNAPSHOT_INTERVAL
        ):
            return False
        _last_auto_snapshot = now
        return True


def _take_snapshot() -> bool:
    """Run the same backup path as the manual
    ``create_backup`` tool.

    Returns True on success, False on failure. Failure
    rolls back the throttle timestamp so the next
    non-read tool call will retry rather than relying on
    a snapshot that was never written -- the user
    explicitly asked for the snapshot to be a hard
    safety net, not a best-effort log line.

    Lazy-imports to avoid a circular dependency between
    this guard module and the tools dispatcher.
    """
    try:
        from ..config import get_config
        from ..services import backup as backup_svc
        from ..services import settings as settings_svc
        cfg = get_config()
        data = settings_svc.load_settings(cfg.SETTINGS_FILE)
        target = settings_svc.resolve_backup_dir(data, cfg)
        info = backup_svc.create_backup(
            source_dir=cfg.DATA_DIR,
            backup_dir=target,
            profile=cfg.PROFILE,
        )
    except (OSError, ValueError) as exc:
        log.warning(
            "Auto-snapshot failed: %s. "
            "Will retry on next AI write.",
            exc,
        )
        return False
    log.info(
        "Auto-snapshot before AI write: %s",
        info.filename,
    )
    return True
