"""Sync clock entries to CalDAV calendars (Phase 1.5).

One-way push: kaisho clock entries become VEVENTs in the
user's chosen CalDAV calendar(s). Edits made in the
Calendar app are ignored; the kaisho entry is the source
of truth.

Triggered on every clock-entry mutation through
``schedule_push`` (the same pattern cloud_sync uses): a
background thread runs ``run_background_push`` under a
non-blocking lock so rapid edits coalesce into one push.
The 5-minute cron job is the safety net for missed runs.

State is tracked in ``<profile>/caldav_clock_map.yaml``
keyed by ``sync_id -> account_id``. Each entry holds the
event URL, etag, last-synced timestamp, and last error
so failures are surfaceable without re-pushing.

Failure model:
  * One bad event does not stop the others.
  * Per-account consecutive failures past
    ``ACCOUNT_FAILURE_THRESHOLD`` mark the account
    "degraded" so the UI can warn, but pushes keep
    being attempted on schedule.

Architecture intentionally avoids:
  * Per-event timers (would multiply timer threads).
  * A separate worker process (the sidecar already
    owns the lifecycle).
  * Pulling events back from CalDAV (that's two-way
    sync; explicitly out of scope).
"""
import logging
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import yaml

from ..config import get_config
from . import caldav as caldav_svc

log = logging.getLogger(__name__)

STATE_FILENAME = "caldav_clock_map.yaml"
ACCOUNT_FAILURE_THRESHOLD = 3

_push_lock = threading.Lock()


# -- State file ------------------------------------------------------


def _state_path() -> Path:
    return get_config().PROFILE_DIR / STATE_FILENAME


def _load_state() -> dict:
    path = _state_path()
    if not path.exists():
        return _empty_state()
    data = yaml.safe_load(path.read_text()) or {}
    data.setdefault("entries", {})
    data.setdefault("per_account", {})
    return data


def _save_state(data: dict) -> None:
    path = _state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False))


def _empty_state() -> dict:
    return {"entries": {}, "per_account": {}}


# -- Public surface --------------------------------------------------


def schedule_push() -> None:
    """Trigger a CalDAV push cycle in a background thread.

    No-op when no accounts have push enabled. The thread
    runs under a non-blocking lock so concurrent mutation
    events coalesce instead of piling up parallel HTTP
    requests against the same provider.
    """
    if not caldav_svc.push_enabled_accounts():
        return
    thread = threading.Thread(
        target=run_background_push, daemon=True,
    )
    thread.start()


def on_local_delete(entry: dict) -> None:
    """Notify the sync engine that a clock entry has been
    deleted locally so the corresponding CalDAV events
    can be removed.

    Called from ``DELETE /clocks/entries`` alongside
    ``cloud_sync.on_local_delete``. Falls back to a normal
    push cycle if the entry is unknown to the state map
    (no-op).
    """
    sync_id = entry.get("sync_id")
    if not sync_id:
        return
    state = _load_state()
    per_entry = state["entries"].get(sync_id) or {}
    if not per_entry:
        return
    for account_id, info in list(per_entry.items()):
        event_url = info.get("event_url")
        if not event_url:
            continue
        try:
            caldav_svc.delete_event(account_id, event_url)
        except caldav_svc.CalDavError as exc:
            log.warning(
                "caldav delete failed: account=%s url=%s %s",
                account_id, event_url, exc,
            )
            _record_account_failure(state, account_id, exc)
            continue
        _record_account_success(state, account_id)
    state["entries"].pop(sync_id, None)
    _save_state(state)


def run_background_push() -> None:
    """Background worker: drive one reconciliation pass.

    Acquires the push lock non-blocking; concurrent
    schedule_push calls return immediately. Per-account
    fan-out so one bad provider doesn't starve the others.
    """
    if not _push_lock.acquire(blocking=False):
        return
    try:
        sync_now()
    except Exception as exc:  # noqa: BLE001
        log.exception("caldav sync cycle failed: %s", exc)
    finally:
        _push_lock.release()


def sync_now() -> dict:
    """Run one reconciliation pass synchronously.

    Public so tests + ``kai caldav push-sync`` can drive
    it without spawning a thread. Returns a summary
    counter (``created`` / ``updated`` / ``deleted`` /
    ``skipped`` / ``errors``) for logging or the upcoming
    UI status indicator.
    """
    accounts = caldav_svc.push_enabled_accounts()
    if not accounts:
        return _empty_summary()

    from datetime import date, timedelta
    from ..backends import get_backend
    backend = get_backend()
    # Reconciliation window: from the earliest
    # push_enabled_since across accounts (so we never
    # miss an entry just because the user toggled push
    # on retroactively) up to today + 1 day to include
    # newly-bookable future entries. Tombstone cleanup
    # for deleted-while-offline edits is out of scope
    # in v1.5 -- on_local_delete covers the happy path.
    from_date = _reconciliation_from(accounts)
    entries = backend.clocks.list_entries(
        from_date=from_date,
        to_date=date.today() + timedelta(days=1),
    )

    state = _load_state()
    summary = _empty_summary()

    for account in accounts:
        for entry in entries:
            _sync_one(account, entry, state, summary)

    _save_state(state)
    log.info(
        "caldav sync: created=%d updated=%d "
        "deleted=%d skipped=%d errors=%d",
        summary["created"], summary["updated"],
        summary["deleted"], summary["skipped"],
        summary["errors"],
    )
    return summary


# -- Per-entry reconciliation ---------------------------------------


def _sync_one(
    account: dict, entry: dict, state: dict, summary: dict,
) -> None:
    sync_id = entry.get("sync_id")
    if not sync_id:
        summary["skipped"] += 1
        return
    account_id = account["account_id"]
    # Look up without setdefault so a skipped entry does
    # not pollute the state map with an empty record.
    # We only create the per-entry dict when we're about
    # to actually write event metadata into it.
    per_entry = state["entries"].get(sync_id) or {}
    existing = per_entry.get(account_id)

    if entry.get("deleted_at"):
        if existing and existing.get("event_url"):
            _delete_event(
                account_id, existing["event_url"],
                state, summary,
            )
            per_entry.pop(account_id, None)
            if per_entry:
                state["entries"][sync_id] = per_entry
            else:
                state["entries"].pop(sync_id, None)
        else:
            summary["skipped"] += 1
        return

    if not _should_push(entry, account):
        summary["skipped"] += 1
        return

    # We are about to write -- materialise the per-entry
    # dict in state so the helpers below can store the
    # event_url / etag they get back from the provider.
    state["entries"].setdefault(sync_id, per_entry)
    if existing and existing.get("event_url"):
        _update_one(
            account, entry, existing, per_entry,
            state, summary,
        )
    else:
        _create_one(
            account, entry, per_entry, state, summary,
        )


def _create_one(
    account, entry, per_entry, state, summary,
) -> None:
    args = _entry_to_event_args(entry)
    if args is None:
        summary["skipped"] += 1
        return
    try:
        out = caldav_svc.create_event(
            account_id=account["account_id"],
            calendar_id=account["calendar_id"],
            **args,
        )
    except caldav_svc.CalDavError as exc:
        log.warning(
            "caldav create failed: account=%s sync_id=%s %s",
            account["account_id"], entry.get("sync_id"),
            exc,
        )
        _record_account_failure(
            state, account["account_id"], exc,
        )
        summary["errors"] += 1
        return
    per_entry[account["account_id"]] = {
        "event_url": out["event_url"],
        "etag": out.get("etag"),
        "last_synced_at": _utc_now_iso(),
        "last_error": None,
    }
    _record_account_success(state, account["account_id"])
    summary["created"] += 1


def _update_one(
    account, entry, existing, per_entry, state, summary,
) -> None:
    args = _entry_to_event_args(entry)
    if args is None:
        summary["skipped"] += 1
        return
    try:
        out = caldav_svc.update_event(
            account_id=account["account_id"],
            event_url=existing["event_url"],
            **{
                k: v for k, v in args.items()
                if k != "uid"
            },
        )
    except caldav_svc.EventGoneError:
        # The event we previously created is no longer on
        # the server -- user deleted it in Calendar.app,
        # or iCloud's eventually-consistent calendar
        # collection still 404s a just-PUT event. Either
        # way, drop the stale mapping and re-create so
        # the next reconciliation hands us a fresh URL.
        log.info(
            "caldav update -> recreate: account=%s "
            "sync_id=%s (server lost the event)",
            account["account_id"], entry.get("sync_id"),
        )
        per_entry.pop(account["account_id"], None)
        _create_one(
            account, entry, per_entry, state, summary,
        )
        return
    except caldav_svc.CalDavError as exc:
        log.warning(
            "caldav update failed: account=%s sync_id=%s %s",
            account["account_id"], entry.get("sync_id"),
            exc,
        )
        _record_account_failure(
            state, account["account_id"], exc,
        )
        summary["errors"] += 1
        return
    per_entry[account["account_id"]] = {
        "event_url": out["event_url"],
        "etag": out.get("etag"),
        "last_synced_at": _utc_now_iso(),
        "last_error": None,
    }
    _record_account_success(state, account["account_id"])
    summary["updated"] += 1


def _delete_event(
    account_id, event_url, state, summary,
) -> None:
    try:
        caldav_svc.delete_event(account_id, event_url)
    except caldav_svc.CalDavError as exc:
        log.warning(
            "caldav delete failed: account=%s url=%s %s",
            account_id, event_url, exc,
        )
        _record_account_failure(state, account_id, exc)
        summary["errors"] += 1
        return
    _record_account_success(state, account_id)
    summary["deleted"] += 1


# -- Gating + payload helpers ----------------------------------------


def _should_push(entry: dict, account: dict) -> bool:
    """Whether this entry is in scope for a push.

    Skip rules:
      * Entries with no end (running timers) -- we push
        when the timer stops.
      * Entries last touched before the account's
        push_enabled_since (no historical back-flood).

    Field naming differs between backends: org emits
    ``start`` / ``end``, SQL emits ``start_at`` /
    ``end_at``. Accept either via :func:`_entry_end`
    so the sync engine works against every backend.
    """
    if not _entry_end(entry):
        return False
    enabled_since = account.get("enabled_since") or ""
    if not enabled_since:
        return True
    updated_at = (
        entry.get("updated_at")
        or _entry_end(entry)
        or ""
    )
    return updated_at >= enabled_since


def _entry_start(entry: dict) -> str:
    """Return the entry's start in whatever field the
    backend chose. SQL uses ``start_at``; org uses
    ``start``. Falls back to ``""`` (None-safe)."""
    return entry.get("start_at") or entry.get("start") or ""


def _entry_end(entry: dict) -> str:
    """Same as :func:`_entry_start` for the end column.
    Returning the empty string for a running timer keeps
    the gate's truthy check simple."""
    return entry.get("end_at") or entry.get("end") or ""


def _entry_to_event_args(entry: dict) -> dict | None:
    """Map a kaisho clock entry to the CalDAV write args
    expected by ``caldav.create_event`` /
    ``caldav.update_event``.

    Returns None for entries that cannot be pushed
    (missing start/end). UID is the entry's sync_id so
    re-pushes find the same event server-side.
    """
    sync_id = entry.get("sync_id") or ""
    start_iso = _entry_start(entry)
    end_iso = _entry_end(entry)
    if not (sync_id and start_iso and end_iso):
        return None
    try:
        start_dt = datetime.fromisoformat(start_iso)
        end_dt = datetime.fromisoformat(end_iso)
    except ValueError:
        return None
    description = entry.get("description") or ""
    customer = entry.get("customer") or ""
    if customer:
        summary = f"[{customer}] {description}".strip()
    else:
        summary = description or "(kaisho)"
    categories = [customer] if customer else None
    return {
        "summary": summary,
        "start": start_dt,
        "end": end_dt,
        "description": description or None,
        "uid": f"kaisho-{sync_id}",
        "categories": categories,
    }


# -- Per-account failure tracking -----------------------------------


def _record_account_failure(
    state: dict, account_id: str, exc: Exception,
) -> None:
    acc_state = state["per_account"].setdefault(
        account_id, {},
    )
    acc_state["failure_count"] = (
        int(acc_state.get("failure_count") or 0) + 1
    )
    acc_state["last_error"] = str(exc)
    acc_state["last_failure_at"] = _utc_now_iso()
    acc_state["degraded"] = (
        acc_state["failure_count"]
        >= ACCOUNT_FAILURE_THRESHOLD
    )


def _record_account_success(
    state: dict, account_id: str,
) -> None:
    acc_state = state["per_account"].setdefault(
        account_id, {},
    )
    acc_state["failure_count"] = 0
    acc_state["last_error"] = None
    acc_state["last_success_at"] = _utc_now_iso()
    acc_state["degraded"] = False


def _reconciliation_from(accounts: list[dict]):
    """Earliest push-enabled-since across all accounts,
    as a date. Falls back to 30 days ago when no account
    has a timestamp recorded yet (defensive)."""
    from datetime import date, datetime, timedelta
    earliest: datetime | None = None
    for acc in accounts:
        ts = acc.get("enabled_since") or ""
        if not ts:
            continue
        try:
            dt = datetime.fromisoformat(ts)
        except ValueError:
            continue
        if earliest is None or dt < earliest:
            earliest = dt
    if earliest is None:
        return date.today() - timedelta(days=30)
    return earliest.date()


def _empty_summary() -> dict:
    return {
        "created": 0, "updated": 0,
        "deleted": 0, "skipped": 0, "errors": 0,
    }


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(
        timespec="seconds",
    )


# -- Public read for the UI / cron -----------------------------------


def get_account_health(account_id: str) -> dict | None:
    """Return the per-account sync health dict (failure
    count, last error, degraded flag) or None when the
    account has never been pushed.

    The Settings panel reads this to show 'last synced
    Xs ago' / 'last error: ...' next to the toggle.
    """
    state = _load_state()
    return state["per_account"].get(account_id)


# -- Tiny sleep helper to keep imports above clean -----


def _sleep(seconds: float) -> None:
    """Kept as a module-private helper so tests can
    monkeypatch sleep without touching ``time`` globally."""
    time.sleep(seconds)
