"""Bidirectional Cloud Sync service.

Design (see kaisho-suite docs for rationale):

- Identity   : shared UUID per clock entry, stored locally
               as ``:SYNC_ID:`` on the heading, and as
               ``clock_entries.id`` on the cloud.
- Conflicts  : last-writer-wins by ``updated_at``. Entries
               with the same logical content but different
               ``sync_id`` are both kept.
- Deletes    : soft on cloud (``deleted_at``), tombstone
               file on local; both propagate through the
               same ``POST /sync/apply`` path.
- Active tmr : a separate pair of endpoints with a "later
               start_at wins" tiebreak (see ``start_active``
               and ``stop_active``).

All calls are best-effort: network failures never raise
out of this module; they flip ``last_error`` in the cursor
state instead.
"""
import json
import logging
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from . import sync_state

log = logging.getLogger(__name__)

_TIMEOUT = 30

# Serialize background push runs so rapid-fire mutations
# don't stack up parallel sync cycles against the cloud.
_push_lock = threading.Lock()


# ── HTTP helpers ──────────────────────────────────────

def _request(
    url: str,
    api_key: str,
    method: str = "GET",
    data: dict | None = None,
    timeout: int = _TIMEOUT,
) -> dict | list | None:
    """Make an authenticated JSON request to the cloud."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = (
        json.dumps(data).encode("utf-8")
        if data is not None
        else None
    )
    req = urllib.request.Request(
        url, data=body, headers=headers, method=method,
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw.strip() else None


class CloudUnavailable(Exception):
    """Raised when the cloud cannot be reached."""


def _safe_request(
    url: str,
    api_key: str,
    method: str = "GET",
    data: dict | None = None,
) -> Any:
    """Wrap ``_request`` to raise a single domain error."""
    try:
        return _request(url, api_key, method, data)
    except (urllib.error.URLError, OSError) as exc:
        raise CloudUnavailable(str(exc)) from exc


# ── Pull changes ──────────────────────────────────────

def pull_changes(
    cloud_url: str,
    api_key: str,
    since: str,
    limit: int = 200,
) -> dict:
    """GET ``/sync/changes?since=`` (paginated)."""
    qs = urllib.parse.urlencode({
        "since": since, "limit": limit,
    })
    url = f"{cloud_url}/sync/changes?{qs}"
    return _safe_request(url, api_key)


# ── Push changes ──────────────────────────────────────

def push_changes(
    cloud_url: str,
    api_key: str,
    entries: list[dict],
) -> dict:
    """POST ``/sync/apply`` with a batch of wire entries."""
    url = f"{cloud_url}/sync/apply"
    return _safe_request(
        url, api_key, "POST", {"entries": entries},
    )


# ── Active timer ──────────────────────────────────────

def cloud_active(
    cloud_url: str, api_key: str,
) -> dict | None:
    """Return the cloud-side active timer, or None if the
    cloud is unreachable / returns ``{active: false}``."""
    try:
        resp = _request(
            f"{cloud_url}/sync/active", api_key,
        )
    except (urllib.error.URLError, urllib.error.HTTPError):
        return None
    except OSError:
        return None
    return resp


def start_active(
    cloud_url: str,
    api_key: str,
    payload: dict,
) -> dict:
    """POST ``/sync/active/start``."""
    return _safe_request(
        f"{cloud_url}/sync/active/start",
        api_key, "POST", payload,
    )


def stop_active(
    cloud_url: str,
    api_key: str,
    payload: dict,
) -> dict:
    """POST ``/sync/active/stop``."""
    return _safe_request(
        f"{cloud_url}/sync/active/stop",
        api_key, "POST", payload,
    )


# ── Snapshot (unchanged) ──────────────────────────────

def push_snapshot(
    cloud_url: str,
    api_key: str,
    customers: list[dict],
    tasks: list[dict],
) -> dict:
    """POST ``/sync/push-snapshot`` (reference data)."""
    url = f"{cloud_url}/sync/push-snapshot"
    return _safe_request(
        url, api_key, "POST",
        {
            "customers": customers,
            "tasks": tasks,
            "snapshot_at": datetime.now().isoformat(),
        },
    )


def cloud_stats(
    cloud_url: str, api_key: str,
) -> dict | None:
    """GET ``/sync/stats``; returns None on failure."""
    try:
        return _safe_request(
            f"{cloud_url}/sync/stats", api_key,
        )
    except CloudUnavailable:
        return None


# ── Wire helpers ──────────────────────────────────────

def _entry_to_wire(entry: dict) -> dict:
    """Shape a local clocks-service entry for /sync/apply."""
    return {
        "id": entry["sync_id"],
        "customer": entry.get("customer") or None,
        "description": entry.get("description") or "",
        "start": entry["start"],
        "end": entry.get("end"),
        "task_id": entry.get("task_id") or None,
        "contract": entry.get("contract") or None,
        "notes": entry.get("notes") or "",
        "invoiced": bool(entry.get("invoiced")),
        "updated_at": (
            entry.get("updated_at")
            or datetime.now().isoformat()
        ),
    }


def _wire_to_local(entry: dict) -> dict:
    """Shape a /sync wire entry for the clocks service."""
    return {
        "sync_id": entry["id"],
        "customer": entry.get("customer") or "",
        "description": entry.get("description") or "",
        "start": entry["start"],
        "end": entry.get("end"),
        "task_id": entry.get("task_id") or None,
        "contract": entry.get("contract") or None,
        "notes": entry.get("notes") or "",
        "invoiced": bool(entry.get("invoiced")),
        "updated_at": entry["updated_at"],
        "deleted_at": entry.get("deleted_at"),
    }


def _tombstone_to_wire(tombstone: dict) -> dict:
    """Shape a local tombstone for /sync/apply."""
    return {
        "id": tombstone["sync_id"],
        "customer": tombstone.get("customer") or None,
        "description": tombstone.get("description") or "",
        "start": tombstone["start"],
        "end": tombstone.get("end"),
        "task_id": tombstone.get("task_id") or None,
        "contract": tombstone.get("contract") or None,
        "notes": tombstone.get("notes") or "",
        "invoiced": bool(tombstone.get("invoiced")),
        "updated_at": tombstone["updated_at"],
        "deleted_at": tombstone["deleted_at"],
    }


# ── On-mutation hooks ─────────────────────────────────
#
# The clocks router calls these after every local write
# so deletes end up in the tombstone file and eager
# push can schedule itself. We avoid importing the
# cursor here to keep the path dependency-light; the
# scheduler / router will pick up the tombstone on next
# push cycle.


def on_local_delete(entry: dict) -> None:
    """Record a tombstone for a locally-deleted entry and
    schedule a background push."""
    from ..config import get_config
    if not entry or not entry.get("sync_id"):
        return
    cfg = get_config()
    now = datetime.now().isoformat()
    tombstone = {
        **entry,
        "deleted_at": now,
        "updated_at": now,
    }
    sync_state.record_tombstone(cfg.PROFILE_DIR, tombstone)
    schedule_push()


def schedule_push() -> None:
    """Fire-and-forget a sync cycle in a background thread.

    No-op when cloud sync is disabled or when another
    push is already running. The 5-min cron job acts as
    the safety net.
    """
    thread = threading.Thread(
        target=_run_scheduled_push, daemon=True,
    )
    thread.start()


def _run_scheduled_push() -> None:
    """Worker that runs ``run_sync_cycle`` if possible."""
    if not _push_lock.acquire(blocking=False):
        return
    try:
        from ..config import get_config
        from ..backends import get_backend
        from . import settings as settings_svc

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
        run_sync_cycle(
            cloud_url=url,
            api_key=key,
            profile_dir=cfg.PROFILE_DIR,
            clocks_file=backend.clocks.data_file,
            customers_fn=backend.customers.list_customers,
            tasks_fn=lambda: backend.tasks.list_tasks(
                include_done=False,
            ),
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("Scheduled push failed: %s", exc)
    finally:
        _push_lock.release()


# ── Sync cycle ────────────────────────────────────────

def _apply_pulled_entries(
    entries: list[dict], backend,
) -> tuple[int, int]:
    """Apply pulled entries to local state.

    Returns ``(upserts, deletes)``.
    """
    upserts = 0
    deletes = 0
    customer_names: set[str] = set()
    for wire in entries:
        local = _wire_to_local(wire)
        if local.get("deleted_at"):
            backend.clocks.delete_entry_by_sync_id(
                local["sync_id"],
            )
            deletes += 1
            continue
        backend.clocks.apply_sync_payload(local)
        upserts += 1
        name = local.get("customer") or ""
        if name:
            customer_names.add(name)
    _autocreate_customers(backend, customer_names)
    return upserts, deletes


def _autocreate_customers(
    backend, names: set[str],
) -> None:
    """Ensure each customer referenced by a synced entry
    has a matching record in the customer backend.

    Mobile clients are allowed to type free-text customer
    names; this is how those names become first-class
    customers on the desktop.
    """
    if not names:
        return
    try:
        existing = {
            c.get("name")
            for c in backend.customers.list_customers(
                include_inactive=True,
            )
        }
    except (AttributeError, TypeError):
        return
    for name in names - existing:
        try:
            backend.customers.add_customer(name=name)
        except (ValueError, Exception) as exc:  # noqa: BLE001
            log.info(
                "Skipping autocreate for %r: %s",
                name, exc,
            )


def _collect_local_changes(
    backend, since: str,
) -> list[dict]:
    """Return local live entries with ``updated_at > since``.

    ``since`` is compared lexicographically — safe for
    ISO-8601 timestamps of equal precision.
    """
    all_entries = backend.clocks.list_entries(period="all")
    out = []
    for entry in all_entries:
        ts = entry.get("updated_at") or ""
        if ts and ts > since:
            out.append(_entry_to_wire(entry))
    return out


def _push_tombstones(
    backend, cloud_url: str, api_key: str,
    profile_dir: Path,
) -> int:
    """Push pending tombstones; clear on success."""
    tombstones = sync_state.load_tombstones(profile_dir)
    if not tombstones:
        return 0
    wire = [_tombstone_to_wire(t) for t in tombstones]
    push_changes(cloud_url, api_key, wire)
    sync_state.clear_tombstones(
        profile_dir,
        [t["sync_id"] for t in tombstones],
    )
    return len(tombstones)


def _push_local_live(
    backend, cloud_url: str, api_key: str,
    since: str,
) -> int:
    """Push locally-changed live entries since cursor.

    Running timers (``end=null``) are routed through
    ``/sync/active/start`` so the cloud's
    active-timer uniqueness + later-start_at-wins logic
    applies. Completed entries are batched through
    ``/sync/apply``.
    """
    changes = _collect_local_changes(backend, since)
    if not changes:
        return 0

    running = [c for c in changes if not c.get("end")]
    completed = [c for c in changes if c.get("end")]

    pushed = 0
    for entry in running:
        start_active(cloud_url, api_key, {
            "id": entry["id"],
            "customer": entry.get("customer"),
            "description": entry.get("description", ""),
            "task_id": entry.get("task_id"),
            "contract": entry.get("contract"),
            "start": entry["start"],
        })
        pushed += 1

    for i in range(0, len(completed), 400):
        batch = completed[i: i + 400]
        push_changes(cloud_url, api_key, batch)
        pushed += len(batch)
    return pushed


def _pull_all(
    backend, cloud_url: str, api_key: str, since: str,
) -> tuple[str, int, int]:
    """Pull pages until exhausted. Returns (cursor, up, del)."""
    cursor = since
    total_up = 0
    total_del = 0
    while True:
        resp = pull_changes(cloud_url, api_key, cursor)
        entries = resp.get("entries", [])
        if entries:
            up, dl = _apply_pulled_entries(entries, backend)
            total_up += up
            total_del += dl
        cursor = resp.get("cursor", cursor)
        if not resp.get("has_more"):
            break
    return cursor, total_up, total_del


def _push_reference_snapshot(
    cloud_url: str,
    api_key: str,
    customers_fn: Callable[[], list[dict]] | None,
    tasks_fn: Callable[[], list[dict]] | None,
) -> bool:
    """Push customer/task reference snapshot, best-effort."""
    if customers_fn is None or tasks_fn is None:
        return False
    try:
        push_snapshot(
            cloud_url, api_key,
            [
                {
                    "name": c.get("name", ""),
                    "contracts": [
                        {
                            "name": ct.get("name", ""),
                            "budget": ct.get("budget", 0),
                            "start_date": ct.get(
                                "start_date", "",
                            ),
                        }
                        for ct in c.get("contracts", [])
                    ],
                }
                for c in customers_fn()
            ],
            [
                {
                    "id": t.get("id", ""),
                    "customer": t.get("customer") or "",
                    "title": t.get("title", ""),
                    "status": t.get("status", ""),
                }
                for t in tasks_fn()
            ],
        )
        return True
    except CloudUnavailable as exc:
        log.warning("Snapshot push failed: %s", exc)
        return False


def run_sync_cycle(
    cloud_url: str,
    api_key: str,
    profile_dir: Path,
    clocks_file: Path,   # kept for call-site compatibility
    customers_fn: Callable[[], list[dict]] | None = None,
    tasks_fn: Callable[[], list[dict]] | None = None,
) -> dict:
    """Run one bidirectional sync cycle.

    Order of operations:
      1. Pull (apply) cloud changes first — cloud is the
         rendezvous point for multi-device edits.
      2. Push tombstones, then push local live changes.
      3. Push reference snapshot (customers/tasks) last;
         mobile reads this for dropdowns.

    Cursor semantics:
      - ``last_pull_cursor`` follows the cloud's
        ``updated_at`` of the last pulled entry.
      - ``last_push_cursor`` is bumped to ``last_pull``
        after a pull (so just-pulled entries don't
        round-trip), and to ``now`` after a successful
        push.
    """
    from ..backends import get_backend
    backend = get_backend()

    cursor = sync_state.load_cursor(profile_dir)
    started = datetime.now().isoformat()
    result = {
        "pulled_up": 0,
        "pulled_del": 0,
        "pushed_live": 0,
        "pushed_deletes": 0,
        "snapshot_pushed": False,
        "error": "",
    }

    try:
        new_pull_cursor, up, dl = _pull_all(
            backend, cloud_url, api_key,
            cursor["last_pull_cursor"],
        )
        cursor["last_pull_cursor"] = new_pull_cursor
        cursor["last_pull_at"] = started
        cursor["last_push_cursor"] = max(
            cursor.get("last_push_cursor") or "",
            new_pull_cursor,
        )
        result["pulled_up"] = up
        result["pulled_del"] = dl
    except CloudUnavailable as exc:
        cursor["last_error"] = f"pull: {exc}"
        sync_state.save_cursor(profile_dir, cursor)
        result["error"] = cursor["last_error"]
        return result

    try:
        pushed_deletes = _push_tombstones(
            backend, cloud_url, api_key, profile_dir,
        )
        pushed_live = _push_local_live(
            backend, cloud_url, api_key,
            cursor["last_push_cursor"],
        )
        cursor["last_push_cursor"] = started
        cursor["last_push_at"] = started
        result["pushed_deletes"] = pushed_deletes
        result["pushed_live"] = pushed_live
    except CloudUnavailable as exc:
        cursor["last_error"] = f"push: {exc}"
        sync_state.save_cursor(profile_dir, cursor)
        result["error"] = cursor["last_error"]
        return result

    if _push_reference_snapshot(
        cloud_url, api_key, customers_fn, tasks_fn,
    ):
        cursor["last_snapshot_push"] = started
        result["snapshot_pushed"] = True

    cursor["last_error"] = None
    sync_state.save_cursor(profile_dir, cursor)
    return result


# ── Back-compat shim ──────────────────────────────────

def cloud_status(
    cloud_url: str, api_key: str,
) -> dict | None:
    """Legacy status probe. Prefer ``cloud_stats``."""
    try:
        return _safe_request(
            f"{cloud_url}/sync/status", api_key,
        )
    except CloudUnavailable:
        return None
