"""Bidirectional cloud sync service.

Handles all communication between the local kaisho app and
the Kaisho Cloud API. Runs a symmetric sync cycle:

1. **Pull** — fetch changed entries from the cloud,
   apply them locally (last-writer-wins).
2. **Push** — send local changes (completed entries,
   tombstones, running timers) up to the cloud.
3. **Snapshot** — push customer/task reference data so
   the mobile PWA has dropdown options.

Design decisions:

- **Identity**: shared UUID per entry (``SYNC_ID`` on the
  org heading, ``clock_entries.id`` on the cloud).
- **Conflicts**: last-writer-wins by ``updated_at``.
  Entries with the same content but different UUIDs are
  both kept (no content-based dedup).
- **Deletes**: soft on cloud (``deleted_at`` column),
  tombstone file on local. Both propagate through
  ``POST /sync/apply``.
- **Active timer**: ``/sync/active/start|stop`` with a
  "later ``start_at`` wins" tiebreak.
- **Best-effort**: network failures never raise out of
  the sync cycle. They set ``last_error`` on the cursor
  and the next cycle retries.
"""
import json
import logging
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from . import sync_state
from ..time_utils import local_now

log = logging.getLogger(__name__)

HTTP_TIMEOUT = 60

_PREFIX_RE = re.compile(
    r"^\[[^\]]+\]:?\s*"
    r"|^(?:EMAIL|LEAD|IDEA|IDEE|NOTE|NOTIZ)\s+",
    re.IGNORECASE,
)


# -- Timezone helpers ------------------------------------------

def _local_to_utc(iso: str) -> str:
    """Convert a naive local ISO timestamp to UTC ISO.

    The local app stores naive datetimes in the system
    timezone.  The cloud stores TIMESTAMPTZ (UTC).  This
    bridge converts local → UTC before pushing.
    """
    if not iso:
        return iso
    try:
        naive = datetime.fromisoformat(iso)
        if naive.tzinfo is not None:
            # Already timezone-aware — convert to UTC
            utc = naive.astimezone(timezone.utc)
            return utc.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        # Naive → assume local timezone
        local = naive.astimezone()  # attach system tz
        utc = local.astimezone(timezone.utc)
        return utc.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    except (ValueError, TypeError):
        return iso


def _utc_to_local(iso: str) -> str:
    """Convert a UTC ISO timestamp to naive local ISO.

    The cloud returns UTC timestamps. The local app
    stores naive datetimes in the system timezone.
    """
    if not iso:
        return iso
    try:
        # Parse — handle both "Z" suffix and "+00:00"
        ts = iso.replace("Z", "+00:00")
        aware = datetime.fromisoformat(ts)
        local = aware.astimezone()  # system timezone
        # Return naive local (strip tzinfo for storage)
        naive = local.replace(tzinfo=None)
        return naive.isoformat()
    except (ValueError, TypeError):
        return iso


# Serialize background pushes so rapid-fire local
# mutations don't stack up parallel sync cycles.
_push_lock = threading.Lock()


def try_acquire_push_lock() -> bool:
    """Try to acquire the push lock (non-blocking).

    :returns: True if acquired, False if already held.
    """
    return _push_lock.acquire(blocking=False)


def release_push_lock() -> None:
    """Release the push lock."""
    _push_lock.release()


# -- HTTP transport -------------------------------------------

class CloudUnavailable(Exception):
    """The cloud API could not be reached or returned a
    non-2xx response.

    Callers catch this to log an error and retry on the
    next cycle — network failures should never crash the
    app.
    """


def http_request(
    url: str,
    api_key: str,
    method: str = "GET",
    data: dict | None = None,
    timeout: int = HTTP_TIMEOUT,
) -> dict | list | None:
    """Send an authenticated JSON request to the cloud.

    :param url: Full URL (e.g.
        ``https://cloud.kaisho.dev/sync/changes``).
    :param api_key: Bearer token for the
        ``Authorization`` header.
    :param method: HTTP method (``GET``, ``POST``, etc.).
    :param data: Request body (serialized to JSON).
    :param timeout: Socket timeout in seconds.
    :returns: Parsed JSON response, or ``None`` for empty
        bodies.
    :raises urllib.error.URLError: On network failure.
    """
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
    with urllib.request.urlopen(
        req, timeout=timeout,
    ) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw.strip() else None


def safe_request(
    url: str,
    api_key: str,
    method: str = "GET",
    data: dict | None = None,
) -> Any:
    """Like ``http_request`` but raises ``CloudUnavailable``
    on any network or HTTP error.

    :param url: Full URL.
    :param api_key: Bearer token.
    :param method: HTTP method.
    :param data: Request body.
    :returns: Parsed JSON response.
    :raises CloudUnavailable: On any failure.
    """
    try:
        return http_request(url, api_key, method, data)
    except (urllib.error.URLError, OSError) as exc:
        raise CloudUnavailable(str(exc)) from exc


# -- Cloud API calls ------------------------------------------

def pull_changes(
    cloud_url: str,
    api_key: str,
    since: str,
    limit: int = 200,
) -> dict:
    """Fetch entries changed after ``since`` from the cloud.

    Calls ``GET /sync/changes?since=<cursor>&limit=<n>``.
    Returns ``{now, cursor, entries, has_more}``.

    :param cloud_url: Base URL (e.g.
        ``https://cloud.kaisho.dev``).
    :param api_key: API key for authentication.
    :param since: ISO cursor — only entries with
        ``updated_at > since`` are returned.
    :param limit: Max entries per page (capped at 500 on
        the cloud).
    :returns: Response dict with ``entries`` list and
        ``cursor`` for the next page.
    :raises CloudUnavailable: On network failure.
    """
    qs = urllib.parse.urlencode({
        "since": since, "limit": limit,
    })
    url = f"{cloud_url}/sync/changes?{qs}"
    return safe_request(url, api_key)


def push_changes(
    cloud_url: str,
    api_key: str,
    entries: list[dict],
) -> dict:
    """Push a batch of entries to the cloud.

    Calls ``POST /sync/apply``. The cloud applies
    last-writer-wins and returns counts of inserted,
    updated, skipped, and errored entries.

    :param cloud_url: Base URL.
    :param api_key: API key.
    :param entries: List of wire-format entry dicts.
    :returns: ``{inserted, updated, skipped, errors}``.
    :raises CloudUnavailable: On network failure.
    """
    url = f"{cloud_url}/sync/apply"
    return safe_request(
        url, api_key, "POST", {"entries": entries},
    )


def ack_entries(
    cloud_url: str,
    api_key: str,
    entry_ids: list[str],
) -> dict:
    """Acknowledge pulled entries on the cloud.

    Stamps ``synced_at`` so the mobile UI can show
    whether the local app has seen each entry.

    :param cloud_url: Base URL.
    :param api_key: API key.
    :param entry_ids: List of entry UUIDs to acknowledge.
    :returns: ``{acked: <count>}``.
    :raises CloudUnavailable: On network failure.
    """
    url = f"{cloud_url}/sync/ack"
    return safe_request(
        url, api_key, "POST", {"ids": entry_ids},
    )


def cloud_active(
    cloud_url: str, api_key: str,
) -> dict | None:
    """Fetch the cloud-side running timer.

    Returns the timer dict (with ``active: true``), or
    ``None`` if the cloud is unreachable or no timer is
    running.

    :param cloud_url: Base URL.
    :param api_key: API key.
    :returns: Timer dict or ``None``.
    """
    try:
        return http_request(
            f"{cloud_url}/sync/active", api_key,
        )
    except (urllib.error.URLError, OSError):
        return None


def start_active(
    cloud_url: str,
    api_key: str,
    payload: dict,
) -> dict:
    """Start or reconcile a running timer on the cloud.

    Calls ``POST /sync/active/start``. If another timer
    is already running, the cloud applies
    "later ``start_at`` wins" — the older timer is
    auto-stopped and the newer one becomes active.

    :param cloud_url: Base URL.
    :param api_key: API key.
    :param payload: ``{id, customer, description, start,
        task_id, contract}``.
    :returns: ``{active, winner, ...entry fields}``.
    :raises CloudUnavailable: On network failure.
    """
    return safe_request(
        f"{cloud_url}/sync/active/start",
        api_key, "POST", payload,
    )


def stop_active(
    cloud_url: str,
    api_key: str,
    payload: dict,
) -> dict:
    """Stop the running timer on the cloud.

    Calls ``POST /sync/active/stop``. Idempotent — if
    the timer is already stopped, returns the completed
    entry.

    :param cloud_url: Base URL.
    :param api_key: API key.
    :param payload: ``{id?, end?}``.
    :returns: Completed entry dict.
    :raises CloudUnavailable: On network failure.
    """
    return safe_request(
        f"{cloud_url}/sync/active/stop",
        api_key, "POST", payload,
    )


def push_snapshot(
    cloud_url: str,
    api_key: str,
    customers: list[dict],
    tasks: list[dict],
    config: dict | None = None,
) -> dict:
    """Push customer/task reference data to the cloud.

    The mobile PWA reads this for dropdown options in the
    timer start and quick-book forms.

    :param cloud_url: Base URL.
    :param api_key: API key.
    :param customers: List of customer dicts with
        ``name`` and ``contracts``.
    :param tasks: List of task dicts with ``id``,
        ``title``, ``customer``, ``status``.
    :param config: Optional settings dict (tags,
        github_configured, task_states).
    :returns: ``{ok: true}``.
    :raises CloudUnavailable: On network failure.
    """
    url = f"{cloud_url}/sync/push-snapshot"
    payload: dict = {
        "customers": customers,
        "tasks": tasks,
        "snapshot_at": local_now().isoformat(),
    }
    if config:
        payload["config"] = config
    return safe_request(
        url, api_key, "POST", payload,
    )


def cloud_stats(
    cloud_url: str, api_key: str,
) -> dict | None:
    """Fetch sync statistics from the cloud.

    Returns ``{entry_count, last_change_at,
    active_timer_id, plan}``, or ``None`` on failure.

    :param cloud_url: Base URL.
    :param api_key: API key.
    :returns: Stats dict or ``None``.
    """
    try:
        return safe_request(
            f"{cloud_url}/sync/stats", api_key,
        )
    except CloudUnavailable as exc:
        log.warning(
            "cloud_stats failed: %s -> %s",
            cloud_url, exc,
        )
        return None


def cloud_ai_complete(
    cloud_url: str,
    api_key: str,
    system: str,
    messages: list[dict],
    max_tokens: int = 4096,
    tools: list[dict] | None = None,
) -> dict:
    """Send a chat completion request to the cloud AI
    gateway and return the full response.

    Routes through ``POST /ai/complete`` which proxies
    to OpenRouter and meters usage.

    :param cloud_url: Base URL.
    :param api_key: API key.
    :param system: System prompt.
    :param messages: List of ``{role, content}`` dicts.
    :param max_tokens: Max response tokens.
    :param tools: Optional OpenAI-format tool defs.
    :returns: Response dict with ``text``, ``tool_calls``,
        ``finish_reason``.
    :raises CloudUnavailable: On network failure.
    """
    url = f"{cloud_url}/ai/complete"
    payload: dict[str, Any] = {
        "system": system,
        "messages": messages,
        "max_tokens": max_tokens,
    }
    if tools:
        payload["tools"] = tools
    return safe_request(url, api_key, "POST", payload)


# Max turns for the cloud agentic loop. Each turn is
# one LLM call + tool execution. Prevents runaway loops
# and limits cost exposure.
_MAX_CLOUD_TURNS = 8

# Max cumulative tokens per agentic run. Aborts the loop
# if token usage exceeds this to prevent cost blowout.
_MAX_TOKENS_PER_RUN = 50000


def cloud_ai_agentic(
    cloud_url: str,
    api_key: str,
    system: str,
    prompt: str,
    tools: list[dict] | None = None,
    tool_executor: Any = None,
    max_tokens: int = 4096,
    on_event: Any = None,
) -> str:
    """Run a multi-turn agentic loop through the cloud
    AI gateway.

    Each turn: send messages + tools to the cloud →
    receive response → if tool_calls, execute locally →
    append results → next turn.

    :param cloud_url: Base URL.
    :param api_key: API key.
    :param system: System prompt.
    :param prompt: User prompt.
    :param tools: OpenAI-format tool definitions.
    :param tool_executor: Callable(name, args) → dict.
    :param max_tokens: Max response tokens per turn.
    :param on_event: Optional callback for UI streaming.
    :returns: Final assistant text response.
    :raises CloudUnavailable: On network failure.
    """
    messages: list[dict] = [
        {"role": "user", "content": prompt},
    ]
    last_text = ""
    total_tokens = 0

    for turn in range(_MAX_CLOUD_TURNS):
        resp = cloud_ai_complete(
            cloud_url, api_key, system,
            messages, max_tokens, tools,
        )
        text = resp.get("text", "")
        tool_calls = resp.get("tool_calls")
        finish = resp.get("finish_reason", "stop")

        # Track cumulative token usage
        usage = resp.get("usage", {})
        total_tokens += (
            usage.get("input_tokens", 0)
            + usage.get("output_tokens", 0)
        )

        if text:
            last_text = text

        # No tool calls → done
        if not tool_calls or finish == "stop":
            break

        # Abort if token budget exceeded
        if total_tokens > _MAX_TOKENS_PER_RUN:
            log.warning(
                "Agentic loop aborted: %d tokens "
                "exceeded %d budget after %d turns",
                total_tokens,
                _MAX_TOKENS_PER_RUN,
                turn + 1,
            )
            break

        # Append assistant message with tool_calls
        assistant_msg: dict[str, Any] = {
            "role": "assistant",
        }
        if text:
            assistant_msg["content"] = text
        assistant_msg["tool_calls"] = tool_calls
        messages.append(assistant_msg)

        # Execute each tool locally
        for call in tool_calls:
            fn = call.get("function", {})
            name = fn.get("name", "")
            args_raw = fn.get("arguments", "{}")
            call_id = call.get("id", "")

            if on_event:
                on_event("tool_call", {
                    "name": name,
                    "args": args_raw,
                })

            # Parse arguments
            if isinstance(args_raw, str):
                try:
                    args = json.loads(args_raw)
                except (json.JSONDecodeError, ValueError):
                    args = {}
            else:
                args = args_raw or {}

            # Execute tool
            if tool_executor:
                result = tool_executor(name, args)
            else:
                result = {
                    "error": "tool execution disabled",
                }

            if on_event:
                on_event("tool_result", {
                    "name": name,
                    "result": result,
                })

            messages.append({
                "role": "tool",
                "content": json.dumps(
                    result, default=str,
                ),
                "tool_call_id": call_id,
            })

    return last_text


def wipe_cloud_entries(
    cloud_url: str, api_key: str,
) -> dict:
    """Delete all clock entries for the user on the cloud.

    Called during disconnect to ensure the cloud is a
    clean slate. The local org file is the single source
    of truth — the cloud is rebuilt from a full push on
    the next connect.

    :param cloud_url: Base URL.
    :param api_key: API key.
    :returns: ``{deleted: <count>}``.
    :raises CloudUnavailable: On network failure.
    """
    url = f"{cloud_url}/sync/entries"
    return safe_request(url, api_key, "DELETE")


def cloud_status(
    cloud_url: str, api_key: str,
) -> dict | None:
    """Legacy status probe (``GET /sync/status``).

    Kept for backwards compatibility with older cloud
    builds. Prefer ``cloud_stats`` for new code.

    :param cloud_url: Base URL.
    :param api_key: API key.
    :returns: Status dict or ``None``.
    """
    try:
        return safe_request(
            f"{cloud_url}/sync/status", api_key,
        )
    except CloudUnavailable:
        return None


# -- Wire format conversion -----------------------------------
#
# "Wire format" is the JSON shape sent over the network.
# Local entries use ``sync_id``; wire entries use ``id``.
# These converters bridge the two.

def entry_to_wire(entry: dict) -> dict:
    """Convert a local entry dict to the wire format used
    by ``POST /sync/apply``.

    Maps ``sync_id`` → ``id``, normalises optional fields,
    and converts local timestamps to UTC for the cloud.

    :param entry: Local clock entry dict.
    :returns: Wire-format dict for the cloud API.
    """
    return {
        "id": entry["sync_id"],
        "customer": entry.get("customer", ""),
        "description": entry.get("description") or "",
        "start": _local_to_utc(entry["start"]),
        "end": (
            _local_to_utc(entry.get("end") or "")
            or None
        ),
        "task_id": entry.get("task_id") or None,
        "contract": entry.get("contract") or None,
        "notes": entry.get("notes") or "",
        "invoiced": bool(entry.get("invoiced")),
        "updated_at": _local_to_utc(
            entry.get("updated_at")
            or local_now().isoformat()
        ),
    }


def wire_to_local(entry: dict) -> dict:
    """Convert a wire-format entry from ``/sync/changes``
    into the local dict shape.

    Maps ``id`` → ``sync_id``, normalises fields, and
    converts UTC timestamps from the cloud to naive local
    timestamps for storage.

    :param entry: Wire-format entry from the cloud.
    :returns: Local entry dict for the clocks service.
    """
    return {
        "sync_id": entry["id"],
        "customer": entry.get("customer") or "",
        "description": entry.get("description") or "",
        "start": _utc_to_local(entry["start"]),
        "end": (
            _utc_to_local(entry.get("end") or "")
            or None
        ),
        "task_id": entry.get("task_id") or None,
        "contract": entry.get("contract") or None,
        "notes": entry.get("notes") or "",
        "invoiced": bool(entry.get("invoiced")),
        "updated_at": _utc_to_local(
            entry["updated_at"],
        ),
        "deleted_at": entry.get("deleted_at"),
    }


# -- Inbox wire format -------------------------------------------

def inbox_item_to_wire(item: dict) -> dict:
    """Convert a local inbox item to the wire format
    used by ``POST /sync/inbox/apply``.

    :param item: Local inbox item dict.
    :returns: Wire-format dict for the cloud API.
    """
    return {
        "id": item["sync_id"],
        "type": item.get("type") or "NOTE",
        "customer": item.get("customer") or "",
        "title": _strip_customer_prefix(
            item.get("title") or "",
        ),
        "body": item.get("body") or "",
        "channel": item.get("channel") or "",
        "direction": item.get("direction") or "in",
        "created_at": _local_to_utc(
            item.get("created") or local_now().isoformat()
        ),
        "updated_at": _local_to_utc(
            item.get("updated_at")
            or local_now().isoformat()
        ),
    }


def wire_to_inbox_item(entry: dict) -> dict:
    """Convert a wire-format inbox item from the cloud
    into the local dict shape.

    :param entry: Wire-format inbox item.
    :returns: Local inbox item dict.
    """
    return {
        "sync_id": entry["id"],
        "type": entry.get("type") or "NOTE",
        "customer": entry.get("customer") or "",
        "title": entry.get("title") or "",
        "body": entry.get("body") or "",
        "channel": entry.get("channel") or "",
        "direction": entry.get("direction") or "in",
        "created": _utc_to_local(
            entry.get("created_at") or ""
        ),
        "updated_at": _utc_to_local(
            entry.get("updated_at", ""),
        ),
        "deleted_at": entry.get("deleted_at"),
    }


# -- Task wire format --------------------------------------------

def _strip_customer_prefix(title: str) -> str:
    """Remove all leading [CUSTOMER] prefixes from a title.

    Handles both ``[X]: text`` (tasks) and ``[X] text``
    (inbox/notes) formats. Also strips any leading TYPE
    keywords like ``IDEA``, ``NOTE``, ``EMAIL``, ``LEAD``.
    """
    prev = None
    while title != prev:
        prev = title
        title = _PREFIX_RE.sub("", title)
    return title.strip()


def task_to_wire(task: dict) -> dict:
    """Convert a local task dict to wire format."""
    return {
        "id": task["sync_id"],
        "customer": task.get("customer") or "",
        "title": _strip_customer_prefix(
            task.get("title") or "",
        ),
        "status": task.get("status") or "TODO",
        "tags": task.get("tags") or [],
        "body": task.get("body") or "",
        "github_url": task.get("github_url") or "",
        "created_at": _local_to_utc(
            task.get("created") or local_now().isoformat()
        ),
        "updated_at": _local_to_utc(
            task.get("updated_at")
            or local_now().isoformat()
        ),
    }


def wire_to_task(entry: dict) -> dict:
    """Convert a wire-format task to local dict."""
    return {
        "sync_id": entry["id"],
        "customer": entry.get("customer") or "",
        "title": entry.get("title") or "",
        "status": entry.get("status") or "TODO",
        "tags": entry.get("tags") or [],
        "body": entry.get("body") or "",
        "github_url": entry.get("github_url") or "",
        "created": _utc_to_local(
            entry.get("created_at") or ""
        ),
        "updated_at": _utc_to_local(
            entry.get("updated_at", ""),
        ),
        "deleted_at": entry.get("deleted_at"),
    }


# -- Note wire format --------------------------------------------

def note_to_wire(note: dict) -> dict:
    """Convert a local note dict to wire format."""
    return {
        "id": note["sync_id"],
        "customer": note.get("customer") or "",
        "title": _strip_customer_prefix(
            note.get("title") or "",
        ),
        "body": note.get("body") or "",
        "tags": note.get("tags") or [],
        "task_id": note.get("task_id") or None,
        "created_at": _local_to_utc(
            note.get("created") or local_now().isoformat()
        ),
        "updated_at": _local_to_utc(
            note.get("updated_at")
            or local_now().isoformat()
        ),
    }


def wire_to_note(entry: dict) -> dict:
    """Convert a wire-format note to local dict."""
    return {
        "sync_id": entry["id"],
        "customer": entry.get("customer") or "",
        "title": entry.get("title") or "",
        "body": entry.get("body") or "",
        "tags": entry.get("tags") or [],
        "task_id": entry.get("task_id") or None,
        "created": _utc_to_local(
            entry.get("created_at") or ""
        ),
        "updated_at": _utc_to_local(
            entry.get("updated_at", ""),
        ),
        "deleted_at": entry.get("deleted_at"),
    }


# -- Entity tombstone wire format --------------------------------

def inbox_tombstone_to_wire(item: dict) -> dict:
    """Convert a local inbox tombstone to wire format.

    Inherits all fields from ``inbox_item_to_wire`` and
    sets ``deleted_at`` and ``updated_at`` to the deletion
    timestamp.

    :param item: Tombstone dict (must contain
        ``sync_id`` and ``deleted_at``).
    :returns: Wire-format dict with ``deleted_at`` set.
    """
    now = _local_to_utc(
        item.get("deleted_at") or local_now().isoformat()
    )
    return {
        **inbox_item_to_wire(item),
        "updated_at": now,
        "deleted_at": now,
    }


def task_tombstone_to_wire(task: dict) -> dict:
    """Convert a local task tombstone to wire format.

    :param task: Tombstone dict (must contain
        ``sync_id`` and ``deleted_at``).
    :returns: Wire-format dict with ``deleted_at`` set.
    """
    now = _local_to_utc(
        task.get("deleted_at") or local_now().isoformat()
    )
    return {
        **task_to_wire(task),
        "updated_at": now,
        "deleted_at": now,
    }


def note_tombstone_to_wire(note: dict) -> dict:
    """Convert a local note tombstone to wire format.

    :param note: Tombstone dict (must contain
        ``sync_id`` and ``deleted_at``).
    :returns: Wire-format dict with ``deleted_at`` set.
    """
    now = _local_to_utc(
        note.get("deleted_at") or local_now().isoformat()
    )
    return {
        **note_to_wire(note),
        "updated_at": now,
        "deleted_at": now,
    }


# -- Clock wire format -------------------------------------------

def tombstone_to_wire(tombstone: dict) -> dict:
    """Convert a local tombstone into wire format for
    ``POST /sync/apply``.

    Tombstones carry ``deleted_at`` so the cloud knows
    to soft-delete the entry.

    :param tombstone: Tombstone dict from
        ``sync_state.load_tombstones()``.
    :returns: Wire-format dict with ``deleted_at`` set.
    """
    return {
        "id": tombstone["sync_id"],
        "customer": tombstone.get("customer") or None,
        "description": (
            tombstone.get("description") or ""
        ),
        "start": _local_to_utc(tombstone["start"]),
        "end": _local_to_utc(
            tombstone.get("end") or "",
        ) or None,
        "task_id": tombstone.get("task_id") or None,
        "contract": tombstone.get("contract") or None,
        "notes": tombstone.get("notes") or "",
        "invoiced": bool(tombstone.get("invoiced")),
        "updated_at": _local_to_utc(
            tombstone["updated_at"],
        ),
        "deleted_at": _local_to_utc(
            tombstone["deleted_at"],
        ),
    }


# -- Mutation hooks -------------------------------------------
#
# Called by the clocks router after every local create,
# update, or delete. Records tombstones and triggers an
# eager background sync so changes propagate without
# waiting for the 5-minute cron cycle.

def on_local_delete(entry: dict) -> None:
    """Record a tombstone for a deleted local entry and
    schedule a background push.

    :param entry: The entry that was just deleted (must
        contain ``sync_id``).
    """
    from ..config import get_config
    if not entry or not entry.get("sync_id"):
        return
    cfg = get_config()
    now = local_now().isoformat()
    tombstone = {
        **entry,
        "deleted_at": now,
        "updated_at": now,
    }
    sync_state.record_tombstone(
        cfg.PROFILE_DIR, tombstone,
    )
    schedule_push()


def on_local_delete_inbox(item: dict) -> None:
    """Record a tombstone for a deleted inbox item and
    schedule a background push.

    :param item: The item that was just deleted (must
        contain ``sync_id``).
    """
    from ..config import get_config
    if not item or not item.get("sync_id"):
        return
    cfg = get_config()
    now = local_now().isoformat()
    tombstone = {
        **item,
        "deleted_at": now,
        "updated_at": now,
    }
    sync_state.record_entity_tombstone(
        cfg.PROFILE_DIR, "inbox", tombstone,
    )
    schedule_push()


def on_local_delete_task(task: dict) -> None:
    """Record a tombstone for a deleted task and schedule
    a background push.

    :param task: The task that was just deleted/archived
        (must contain ``sync_id``).
    """
    from ..config import get_config
    if not task or not task.get("sync_id"):
        return
    cfg = get_config()
    now = local_now().isoformat()
    tombstone = {
        **task,
        "deleted_at": now,
        "updated_at": now,
    }
    sync_state.record_entity_tombstone(
        cfg.PROFILE_DIR, "task", tombstone,
    )
    schedule_push()


def on_local_delete_note(note: dict) -> None:
    """Record a tombstone for a deleted note and schedule
    a background push.

    :param note: The note that was just deleted (must
        contain ``sync_id``).
    """
    from ..config import get_config
    if not note or not note.get("sync_id"):
        return
    cfg = get_config()
    now = local_now().isoformat()
    tombstone = {
        **note,
        "deleted_at": now,
        "updated_at": now,
    }
    sync_state.record_entity_tombstone(
        cfg.PROFILE_DIR, "note", tombstone,
    )
    schedule_push()


def push_inbox_tombstones(
    cloud_url: str, api_key: str, profile_dir: Path,
) -> int:
    """Push pending inbox tombstones to the cloud.

    :param cloud_url: Base URL.
    :param api_key: API key.
    :param profile_dir: Profile directory.
    :returns: Number of tombstones pushed.
    :raises CloudUnavailable: On network failure.
    """
    tombstones = sync_state.load_entity_tombstones(
        profile_dir, "inbox",
    )
    if not tombstones:
        return 0
    wire = list(map(inbox_tombstone_to_wire, tombstones))
    push_inbox_items(cloud_url, api_key, wire)
    sync_state.clear_entity_tombstones(
        profile_dir, "inbox",
        [t["sync_id"] for t in tombstones],
    )
    return len(tombstones)


def push_task_tombstones(
    cloud_url: str, api_key: str, profile_dir: Path,
) -> int:
    """Push pending task tombstones to the cloud.

    :param cloud_url: Base URL.
    :param api_key: API key.
    :param profile_dir: Profile directory.
    :returns: Number of tombstones pushed.
    :raises CloudUnavailable: On network failure.
    """
    tombstones = sync_state.load_entity_tombstones(
        profile_dir, "task",
    )
    if not tombstones:
        return 0
    wire = list(map(task_tombstone_to_wire, tombstones))
    push_task_items(cloud_url, api_key, wire)
    sync_state.clear_entity_tombstones(
        profile_dir, "task",
        [t["sync_id"] for t in tombstones],
    )
    return len(tombstones)


def push_note_tombstones(
    cloud_url: str, api_key: str, profile_dir: Path,
) -> int:
    """Push pending note tombstones to the cloud.

    :param cloud_url: Base URL.
    :param api_key: API key.
    :param profile_dir: Profile directory.
    :returns: Number of tombstones pushed.
    :raises CloudUnavailable: On network failure.
    """
    tombstones = sync_state.load_entity_tombstones(
        profile_dir, "note",
    )
    if not tombstones:
        return 0
    wire = list(map(note_tombstone_to_wire, tombstones))
    push_note_items(cloud_url, api_key, wire)
    sync_state.clear_entity_tombstones(
        profile_dir, "note",
        [t["sync_id"] for t in tombstones],
    )
    return len(tombstones)


def schedule_push() -> None:
    """Trigger a sync cycle in a background thread.

    No-op when cloud sync is disabled or when another
    push is already in progress. The 5-minute cron job
    acts as the safety net for any missed pushes.
    """
    thread = threading.Thread(
        target=run_background_sync, daemon=True,
    )
    thread.start()


def run_background_sync() -> None:
    """Background worker: runs a full sync cycle if the
    push lock is available.

    Acquires a non-blocking lock so concurrent mutation
    events don't pile up parallel HTTP requests. Errors
    are logged and swallowed — the next cycle will retry.
    """
    if not _push_lock.acquire(blocking=False):
        return
    try:
        from ..config import get_config
        from ..backends import get_backend
        from . import settings as settings_svc

        cfg = get_config()
        data = settings_svc.load_settings(
            cfg.SETTINGS_FILE,
        )
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
            customers_fn=(
                backend.customers.list_customers
            ),
            tasks_fn=lambda: backend.tasks.list_tasks(
                include_done=False,
            ),
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("Background sync failed: %s", exc)
    finally:
        _push_lock.release()


# -- Sync cycle steps -----------------------------------------

def apply_pulled_entry(
    entries: list[dict], backend,
) -> tuple[int, int, list[str]]:
    """Apply a batch of pulled entries to local state.

    For each entry:
    - If ``deleted_at`` is set, delete the local entry
      (propagate the cloud-side deletion).
    - Otherwise, upsert via
      ``backend.clocks.apply_sync_payload``.

    Also auto-creates local customer records for any new
    customer names typed on the mobile app.

    :param entries: Wire-format entries from the cloud.
    :param backend: Kaisho backend instance.
    :returns: ``(upserts, deletes, pulled_ids)`` — the
        ``pulled_ids`` are used by the caller to ack.
    """
    upserts = 0
    deletes = 0
    pulled_ids: list[str] = []
    customer_names: set[str] = set()
    for wire in entries:
        local = wire_to_local(wire)
        if local.get("deleted_at"):
            backend.clocks.delete_entry_by_sync_id(
                local["sync_id"],
            )
            deletes += 1
            pulled_ids.append(wire["id"])
            continue
        backend.clocks.apply_sync_payload(local)
        upserts += 1
        pulled_ids.append(wire["id"])
        name = local.get("customer") or ""
        if name:
            customer_names.add(name)
    autocreate_customer(backend, customer_names)
    return upserts, deletes, pulled_ids


def autocreate_customer(
    backend, names: set[str],
) -> None:
    """Create local customer records for names that don't
    exist yet.

    Mobile users can type free-text customer names when
    starting a timer. When those entries sync to the
    desktop, this function ensures the customer appears
    in the customer list without manual setup.

    :param backend: Kaisho backend instance.
    :param names: Set of customer names to check.
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


def collect_local_change(
    backend, since: str,
) -> list[dict]:
    """Collect local entries modified after ``since``.

    Timestamps are compared lexicographically — safe for
    ISO-8601 strings of consistent precision.

    :param backend: Kaisho backend instance.
    :param since: ISO cursor timestamp.
    :returns: List of wire-format entry dicts.
    """
    all_entries = backend.clocks.list_entries(period="all")
    return [
        entry_to_wire(entry)
        for entry in all_entries
        if (entry.get("updated_at") or "") > since
    ]


def push_tombstone(
    backend, cloud_url: str, api_key: str,
    profile_dir: Path,
) -> int:
    """Push pending tombstones to the cloud and clear
    them locally on success.

    :param backend: Kaisho backend instance.
    :param cloud_url: Base URL.
    :param api_key: API key.
    :param profile_dir: Profile directory.
    :returns: Number of tombstones pushed.
    :raises CloudUnavailable: On network failure.
    """
    tombstones = sync_state.load_tombstones(profile_dir)
    if not tombstones:
        return 0
    wire = list(map(tombstone_to_wire, tombstones))
    push_changes(cloud_url, api_key, wire)
    sync_state.clear_tombstones(
        profile_dir,
        [t["sync_id"] for t in tombstones],
    )
    return len(tombstones)


def push_local_entry(
    backend, cloud_url: str, api_key: str,
    since: str,
) -> int:
    """Push locally-changed entries to the cloud.

    Running timers (``end=null``) are routed through
    ``/sync/active/start`` so the cloud's active-timer
    uniqueness and "later start_at wins" logic applies.
    Completed entries go through ``/sync/apply`` in
    400-entry batches.

    :param backend: Kaisho backend instance.
    :param cloud_url: Base URL.
    :param api_key: API key.
    :param since: Only push entries with
        ``updated_at > since``.
    :returns: Total number of entries pushed.
    :raises CloudUnavailable: On network failure.
    """
    changes = collect_local_change(backend, since)
    if not changes:
        return 0

    # Running timers need the active-start endpoint
    # because the cloud enforces at-most-one-active with
    # a unique index. Bulk /sync/apply would violate it.
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


def pull_and_apply(
    backend, cloud_url: str, api_key: str, since: str,
) -> tuple[str, int, int]:
    """Pull all pages from the cloud, apply each to local,
    and ack the pulled IDs.

    :param backend: Kaisho backend instance.
    :param cloud_url: Base URL.
    :param api_key: API key.
    :param since: Pull cursor.
    :returns: ``(new_cursor, upserts, deletes)``.
    :raises CloudUnavailable: On network failure.
    """
    cursor = since
    total_up = 0
    total_del = 0
    all_ids: list[str] = []
    while True:
        resp = pull_changes(cloud_url, api_key, cursor)
        entries = resp.get("entries", [])
        if entries:
            up, dl, ids = apply_pulled_entry(
                entries, backend,
            )
            total_up += up
            total_del += dl
            all_ids.extend(ids)
        cursor = resp.get("cursor", cursor)
        if not resp.get("has_more"):
            break
    # Ack so the mobile UI shows a synced indicator.
    # Best-effort — if it fails the next cycle retries.
    if all_ids:
        try:
            ack_entries(cloud_url, api_key, all_ids)
        except CloudUnavailable:
            pass
    return cursor, total_up, total_del


# -- Inbox sync --------------------------------------------------

def pull_inbox_changes(
    cloud_url: str,
    api_key: str,
    since: str,
) -> tuple[str, list[dict], bool]:
    """Pull inbox items from the cloud.

    :returns: (cursor, entries, has_more)
    """
    qs = urllib.parse.urlencode({
        "since": since, "limit": 200,
    })
    url = f"{cloud_url}/sync/inbox/changes?{qs}"
    data = safe_request(url, api_key)
    return (
        data.get("cursor", since),
        data.get("entries", []),
        data.get("has_more", False),
    )


def push_inbox_items(
    cloud_url: str,
    api_key: str,
    items: list[dict],
) -> int:
    """Push inbox items to the cloud.

    :param items: Wire-format inbox items.
    :returns: Number of applied items.
    """
    if not items:
        return 0
    url = f"{cloud_url}/sync/inbox/apply"
    data = safe_request(
        url, api_key, "POST", {"entries": items},
    )
    return (
        data.get("inserted", 0) + data.get("updated", 0)
    )


def ack_inbox_items(
    cloud_url: str,
    api_key: str,
    ids: list[str],
) -> None:
    """Mark inbox items as synced on the cloud."""
    if not ids:
        return
    for i in range(0, len(ids), 500):
        batch = ids[i:i + 500]
        url = f"{cloud_url}/sync/inbox/ack"
        safe_request(
            url, api_key, "POST", {"ids": batch},
        )


def pull_and_apply_inbox(
    backend,
    cloud_url: str,
    api_key: str,
    since: str,
) -> tuple[str, int, int, set[str]]:
    """Pull inbox items from cloud and apply locally.

    :returns: (cursor, upserted, deleted, pulled_sync_ids)
    """
    cursor = since
    total_up = 0
    total_del = 0
    all_sync_ids: set[str] = set()
    by_sync: dict | None = None

    while True:
        new_cursor, entries, has_more = (
            pull_inbox_changes(cloud_url, api_key, cursor)
        )
        if by_sync is None:
            items = backend.inbox.list_items()
            by_sync = {
                i.get("sync_id"): i for i in items
                if i.get("sync_id")
            }
        pulled_ids = []
        for wire_item in entries:
            incoming = wire_to_inbox_item(wire_item)
            pulled_ids.append(wire_item["id"])
            all_sync_ids.add(incoming["sync_id"])
            existing = by_sync.get(incoming["sync_id"])
            if incoming.get("deleted_at"):
                if existing:
                    backend.inbox.remove_item(
                        existing["id"],
                    )
                    total_del += 1
            elif existing:
                local_ts = existing.get(
                    "updated_at", "",
                )
                remote_ts = incoming.get(
                    "updated_at", "",
                )
                if remote_ts > local_ts:
                    backend.inbox.update_item(
                        existing["id"],
                        {
                            "title": incoming["title"],
                            "type": incoming["type"],
                            "customer": (
                                incoming["customer"]
                            ),
                            "body": incoming["body"],
                            "channel": (
                                incoming["channel"]
                            ),
                            "direction": (
                                incoming["direction"]
                            ),
                        },
                    )
                    total_up += 1
            else:
                backend.inbox.add_item(
                    text=incoming["title"],
                    item_type=incoming["type"],
                    customer=incoming["customer"],
                    body=incoming["body"],
                    channel=incoming["channel"],
                    direction=incoming["direction"],
                    sync_id=incoming["sync_id"],
                )
                total_up += 1

        try:
            ack_inbox_items(
                cloud_url, api_key, pulled_ids,
            )
        except CloudUnavailable:
            pass

        cursor = new_cursor
        if not has_more:
            break

    return cursor, total_up, total_del, all_sync_ids


def collect_inbox_changes(
    backend,
    since: str,
    exclude: set[str] | None = None,
) -> list[dict]:
    """Gather inbox items changed after ``since``.

    :param exclude: Sync IDs to skip (just-pulled items).
    :returns: List of wire-format inbox items.
    """
    skip = exclude or set()
    items = backend.inbox.list_items()
    wire = []
    for item in items:
        if item.get("sync_id") in skip:
            continue
        updated = item.get("updated_at", "")
        if updated > since:
            wire.append(inbox_item_to_wire(item))
    return wire


# -- Task sync ---------------------------------------------------

def pull_task_changes(
    cloud_url: str, api_key: str, since: str,
) -> tuple[str, list[dict], bool]:
    """Pull tasks from the cloud."""
    qs = urllib.parse.urlencode({
        "since": since, "limit": 200,
    })
    url = f"{cloud_url}/sync/tasks/changes?{qs}"
    data = safe_request(url, api_key)
    return (
        data.get("cursor", since),
        data.get("entries", []),
        data.get("has_more", False),
    )


def push_task_items(
    cloud_url: str, api_key: str, items: list[dict],
) -> int:
    """Push tasks to the cloud."""
    if not items:
        return 0
    url = f"{cloud_url}/sync/tasks/apply"
    data = safe_request(
        url, api_key, "POST", {"entries": items},
    )
    return (
        data.get("inserted", 0) + data.get("updated", 0)
    )


def ack_task_items(
    cloud_url: str, api_key: str, ids: list[str],
) -> None:
    """Mark tasks as synced on the cloud."""
    if not ids:
        return
    for i in range(0, len(ids), 500):
        batch = ids[i:i + 500]
        url = f"{cloud_url}/sync/tasks/ack"
        safe_request(
            url, api_key, "POST", {"ids": batch},
        )


def pull_and_apply_tasks(
    backend, cloud_url: str, api_key: str, since: str,
) -> tuple[str, int, int, set[str]]:
    """Pull tasks from cloud and apply locally.

    :returns: (cursor, upserted, deleted, pulled_sync_ids)
    """
    cursor = since
    total_up = 0
    total_del = 0
    all_sync_ids: set[str] = set()
    by_sync: dict | None = None

    while True:
        new_cursor, entries, has_more = (
            pull_task_changes(cloud_url, api_key, cursor)
        )
        if by_sync is None:
            tasks = backend.tasks.list_tasks(
                include_done=True,
            )
            by_sync = {
                t.get("sync_id"): t for t in tasks
                if t.get("sync_id")
            }
        pulled_ids = []
        for wire_item in entries:
            incoming = wire_to_task(wire_item)
            pulled_ids.append(wire_item["id"])
            all_sync_ids.add(incoming["sync_id"])
            existing = by_sync.get(
                incoming["sync_id"],
            )
            if incoming.get("deleted_at"):
                if existing:
                    backend.tasks.archive_task(
                        existing["id"],
                    )
                    total_del += 1
            elif existing:
                local_ts = existing.get(
                    "updated_at", "",
                )
                remote_ts = incoming.get(
                    "updated_at", "",
                )
                if remote_ts > local_ts:
                    backend.tasks.update_task(
                        existing["id"],
                        title=incoming["title"],
                        customer=incoming["customer"],
                        body=incoming["body"],
                        github_url=(
                            incoming["github_url"]
                        ),
                    )
                    if incoming.get(
                        "tags",
                    ) != existing.get("tags"):
                        backend.tasks.set_tags(
                            existing["id"],
                            incoming.get("tags") or [],
                        )
                    if (
                        incoming["status"]
                        != existing.get("status")
                    ):
                        backend.tasks.move_task(
                            existing["id"],
                            incoming["status"],
                        )
                    total_up += 1
            else:
                backend.tasks.add_task(
                    customer=incoming["customer"],
                    title=incoming["title"],
                    status=incoming["status"],
                    body=incoming["body"],
                    github_url=incoming["github_url"],
                    tags=incoming.get("tags"),
                    sync_id=incoming["sync_id"],
                )
                total_up += 1

        try:
            ack_task_items(
                cloud_url, api_key, pulled_ids,
            )
        except CloudUnavailable:
            pass
        cursor = new_cursor
        if not has_more:
            break

    return cursor, total_up, total_del, all_sync_ids


def collect_task_changes(
    backend,
    since: str,
    exclude: set[str] | None = None,
) -> list[dict]:
    """Gather tasks changed after ``since``.

    :param exclude: Sync IDs to skip (just-pulled items).
    """
    skip = exclude or set()
    tasks = backend.tasks.list_tasks(include_done=True)
    wire = []
    for task in tasks:
        if task.get("sync_id") in skip:
            continue
        updated = task.get("updated_at", "")
        if updated > since:
            wire.append(task_to_wire(task))
    return wire


# -- Note sync ---------------------------------------------------

def pull_note_changes(
    cloud_url: str, api_key: str, since: str,
) -> tuple[str, list[dict], bool]:
    """Pull notes from the cloud."""
    qs = urllib.parse.urlencode({
        "since": since, "limit": 200,
    })
    url = f"{cloud_url}/sync/notes/changes?{qs}"
    data = safe_request(url, api_key)
    return (
        data.get("cursor", since),
        data.get("entries", []),
        data.get("has_more", False),
    )


def push_note_items(
    cloud_url: str, api_key: str, items: list[dict],
) -> int:
    """Push notes to the cloud."""
    if not items:
        return 0
    url = f"{cloud_url}/sync/notes/apply"
    data = safe_request(
        url, api_key, "POST", {"entries": items},
    )
    return (
        data.get("inserted", 0) + data.get("updated", 0)
    )


def ack_note_items(
    cloud_url: str, api_key: str, ids: list[str],
) -> None:
    """Mark notes as synced on the cloud."""
    if not ids:
        return
    for i in range(0, len(ids), 500):
        batch = ids[i:i + 500]
        url = f"{cloud_url}/sync/notes/ack"
        safe_request(
            url, api_key, "POST", {"ids": batch},
        )


def pull_and_apply_notes(
    backend, cloud_url: str, api_key: str, since: str,
) -> tuple[str, int, int, set[str]]:
    """Pull notes from cloud and apply locally.

    :returns: (cursor, upserted, deleted, pulled_sync_ids)
    """
    cursor = since
    total_up = 0
    total_del = 0
    all_sync_ids: set[str] = set()
    by_sync: dict | None = None

    while True:
        new_cursor, entries, has_more = (
            pull_note_changes(cloud_url, api_key, cursor)
        )
        if by_sync is None:
            notes = backend.notes.list_notes()
            by_sync = {
                n.get("sync_id"): n for n in notes
                if n.get("sync_id")
            }
        pulled_ids = []
        for wire_item in entries:
            incoming = wire_to_note(wire_item)
            pulled_ids.append(wire_item["id"])
            all_sync_ids.add(incoming["sync_id"])
            existing = by_sync.get(
                incoming["sync_id"],
            )
            if incoming.get("deleted_at"):
                if existing:
                    backend.notes.delete_note(
                        existing["id"],
                    )
                    total_del += 1
            elif existing:
                local_ts = existing.get(
                    "updated_at", "",
                )
                remote_ts = incoming.get(
                    "updated_at", "",
                )
                if remote_ts > local_ts:
                    backend.notes.update_note(
                        existing["id"],
                        {
                            "title": incoming["title"],
                            "customer": (
                                incoming["customer"]
                            ),
                            "body": incoming["body"],
                            "tags": incoming.get(
                                "tags", [],
                            ),
                            "task_id": incoming.get(
                                "task_id",
                            ),
                        },
                    )
                    total_up += 1
            else:
                backend.notes.add_note(
                    title=incoming["title"],
                    body=incoming["body"],
                    customer=incoming["customer"],
                    tags=incoming.get("tags"),
                    task_id=incoming.get("task_id"),
                    sync_id=incoming["sync_id"],
                )
                total_up += 1

        try:
            ack_note_items(
                cloud_url, api_key, pulled_ids,
            )
        except CloudUnavailable:
            pass
        cursor = new_cursor
        if not has_more:
            break

    return cursor, total_up, total_del, all_sync_ids


def collect_note_changes(
    backend,
    since: str,
    exclude: set[str] | None = None,
) -> list[dict]:
    """Gather notes changed after ``since``.

    :param exclude: Sync IDs to skip (just-pulled items).
    """
    skip = exclude or set()
    notes = backend.notes.list_notes()
    wire = []
    for note in notes:
        if note.get("sync_id") in skip:
            continue
        updated = note.get("updated_at", "")
        if updated > since:
            wire.append(note_to_wire(note))
    return wire


class _CfgForDir:
    """Minimal config stub pointing at a profile dir.

    Used by ``_pull_config_updates`` and
    ``_build_snapshot_config`` so they can call
    ``load_user_yaml`` / ``save_user_yaml`` for any
    profile, not just the active one.
    """

    def __init__(self, profile_dir: Path):
        self.PROFILE_DIR = profile_dir


def _pull_config_updates(
    cloud_url: str,
    api_key: str,
    profile_dir: Path | None = None,
) -> None:
    """Pull config from cloud and apply user_name
    changes to the profile's user.yaml.

    :param cloud_url: Base URL.
    :param api_key: API key.
    :param profile_dir: Profile directory. Falls back
        to the active profile.
    """
    from ..config import (
        get_config, load_user_yaml, save_user_yaml,
    )

    try:
        data = safe_request(
            f"{cloud_url}/ref/config", api_key,
        )
    except CloudUnavailable:
        return
    if not data or not isinstance(data, dict):
        return

    cloud_name = data.get("user_name", "")
    if not cloud_name:
        return

    cfg = (
        _CfgForDir(profile_dir)
        if profile_dir
        else get_config()
    )
    user = load_user_yaml(cfg)
    if user.get("name") != cloud_name:
        user["name"] = cloud_name
        save_user_yaml(cfg, user)
        log.info(
            "Updated user name from cloud: %s",
            cloud_name,
        )


def _build_snapshot_config(
    settings_file: Path | None = None,
    profile_dir: Path | None = None,
) -> dict:
    """Build config dict for the reference snapshot.

    Includes tags and feature flags so the PWA can
    mirror the desktop app's settings.

    :param settings_file: Explicit settings path.
        Falls back to the active profile's settings.
    :param profile_dir: Profile directory for user.yaml.
        Falls back to the active profile.
    :returns: Config dict with tags, github flag,
        avatar_seed, and user_name.
    """
    from .settings import load_settings
    from ..config import get_config, load_user_yaml

    cfg = get_config()
    path = settings_file or cfg.SETTINGS_FILE
    data = load_settings(path)
    tags = data.get("tags", [])
    github = data.get("github", {})
    user_cfg = (
        _CfgForDir(profile_dir)
        if profile_dir
        else cfg
    )
    user = load_user_yaml(user_cfg)
    return {
        "tags": [
            {
                "name": t.get("name", ""),
                "color": t.get("color", ""),
            }
            for t in tags
        ],
        "github_configured": bool(
            github.get("token"),
        ),
        "avatar_seed": user.get(
            "avatar_seed", "kaisho",
        ),
        "user_name": user.get("name", ""),
    }


def push_reference_snapshot(
    cloud_url: str,
    api_key: str,
    customers_fn: Callable[[], list[dict]] | None,
    tasks_fn: Callable[[], list[dict]] | None,
    settings_file: Path | None = None,
    profile_dir: Path | None = None,
) -> bool:
    """Push customer/task reference data (best-effort).

    :param cloud_url: Base URL.
    :param api_key: API key.
    :param customers_fn: Callable returning customer list.
    :param tasks_fn: Callable returning task list.
    :param settings_file: Settings file for snapshot
        config. Falls back to the active profile.
    :param profile_dir: Profile directory for user.yaml.
        Falls back to the active profile.
    :returns: ``True`` on success, ``False`` on failure.
    """
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
            config=_build_snapshot_config(
                settings_file, profile_dir,
            ),
        )
        return True
    except CloudUnavailable as exc:
        log.warning("Snapshot push failed: %s", exc)
        return False


# -- Main sync cycle ------------------------------------------

def run_sync_cycle(
    cloud_url: str,
    api_key: str,
    profile_dir: Path,
    customers_fn: Callable[[], list[dict]] | None = None,
    tasks_fn: Callable[[], list[dict]] | None = None,
    backend=None,
    settings_file: Path | None = None,
) -> dict:
    """Run one complete bidirectional sync cycle.

    **Order of operations** (important for consistency):

    1. Pull cloud changes first — the cloud is the
       rendezvous point for multi-device edits.
    2. Push tombstones (local deletes).
    3. Push local live changes.
    4. Push reference snapshot last — the mobile reads
       this for dropdown options.

    **Cursor semantics:**

    - ``last_pull_cursor`` tracks the cloud's
      ``updated_at`` of the last pulled entry.
    - ``last_push_cursor`` is bumped to ``last_pull``
      after a pull (so just-pulled entries don't
      round-trip), and to ``now`` after a successful
      push.

    :param cloud_url: Base URL.
    :param api_key: API key.
    :param profile_dir: Profile directory.
    :param customers_fn: Callable returning customer list.
    :param tasks_fn: Callable returning task list.
    :param backend: Backend instance. Falls back to
        ``get_backend()`` when None (active profile).
    :param settings_file: Settings file path for
        snapshot config. Falls back to active profile.
    :returns: Result dict with counts and error message.
    """
    if backend is None:
        from ..backends import get_backend
        backend = get_backend()

    cursor = sync_state.load_cursor(profile_dir)
    started = local_now().isoformat()
    result = {
        "pulled_up": 0,
        "pulled_del": 0,
        "pushed_live": 0,
        "pushed_deletes": 0,
        "snapshot_pushed": False,
        "error": "",
    }

    # On the first sync after connect the push cursor is
    # at EPOCH. We must push *all* local entries, not
    # just those modified after the pull cursor.
    is_initial = (
        cursor["last_push_cursor"] == sync_state.EPOCH
    )

    # Step 1: Pull
    try:
        new_cursor, up, dl = pull_and_apply(
            backend, cloud_url, api_key,
            cursor["last_pull_cursor"],
        )
        cursor["last_pull_cursor"] = new_cursor
        cursor["last_pull_at"] = started
        # Bump push cursor past pulled entries so they
        # don't echo back on the next push.
        cursor["last_push_cursor"] = max(
            cursor.get("last_push_cursor") or "",
            new_cursor,
        )
        result["pulled_up"] = up
        result["pulled_del"] = dl
    except CloudUnavailable as exc:
        cursor["last_error"] = f"pull: {exc}"
        sync_state.save_cursor(profile_dir, cursor)
        result["error"] = cursor["last_error"]
        return result

    # Step 2 + 3: Push
    # On initial sync, use EPOCH to push all local
    # entries. The cloud's /sync/apply uses LWW so
    # re-pushing already-synced entries is harmless.
    push_since = (
        sync_state.EPOCH
        if is_initial
        else cursor["last_push_cursor"]
    )
    try:
        result["pushed_deletes"] = push_tombstone(
            backend, cloud_url, api_key, profile_dir,
        )
        result["pushed_live"] = push_local_entry(
            backend, cloud_url, api_key,
            push_since,
        )
        cursor["last_push_cursor"] = started
        cursor["last_push_at"] = started
    except CloudUnavailable as exc:
        cursor["last_error"] = f"push: {exc}"
        sync_state.save_cursor(profile_dir, cursor)
        result["error"] = cursor["last_error"]
        return result

    entity_errors: list[str] = []

    # Step 4: Inbox sync
    inbox_pull_since = (
        cursor.get("inbox_pull_cursor")
        or sync_state.EPOCH
    )
    inbox_push_since = (
        sync_state.EPOCH
        if is_initial
        else cursor.get("inbox_push_cursor")
        or sync_state.EPOCH
    )
    try:
        inbox_cursor, inbox_up, inbox_del, inbox_pulled = (
            pull_and_apply_inbox(
                backend, cloud_url, api_key,
                inbox_pull_since,
            )
        )
        cursor["inbox_pull_cursor"] = inbox_cursor
        cursor["inbox_push_cursor"] = max(
            cursor.get("inbox_push_cursor") or "",
            inbox_cursor,
        )
        result["pulled_up"] += inbox_up
        result["pulled_del"] += inbox_del

        pushed_del = push_inbox_tombstones(
            cloud_url, api_key, profile_dir,
        )
        result["pushed_deletes"] += pushed_del
        inbox_wire = collect_inbox_changes(
            backend, inbox_push_since, inbox_pulled,
        )
        pushed = push_inbox_items(
            cloud_url, api_key, inbox_wire,
        )
        result["pushed_live"] += pushed
        cursor["inbox_push_cursor"] = started
    except CloudUnavailable as exc:
        entity_errors.append(f"inbox: {exc}")
        log.warning("Inbox sync failed: %s", exc)

    # Step 5: Task sync
    task_pull_since = (
        cursor.get("task_pull_cursor")
        or sync_state.EPOCH
    )
    task_push_since = (
        sync_state.EPOCH
        if is_initial
        else cursor.get("task_push_cursor")
        or sync_state.EPOCH
    )
    try:
        task_cursor, task_up, task_del, task_pulled = (
            pull_and_apply_tasks(
                backend, cloud_url, api_key,
                task_pull_since,
            )
        )
        cursor["task_pull_cursor"] = task_cursor
        cursor["task_push_cursor"] = max(
            cursor.get("task_push_cursor") or "",
            task_cursor,
        )
        result["pulled_up"] += task_up
        result["pulled_del"] += task_del

        pushed_del = push_task_tombstones(
            cloud_url, api_key, profile_dir,
        )
        result["pushed_deletes"] += pushed_del
        task_wire = collect_task_changes(
            backend, task_push_since, task_pulled,
        )
        pushed = push_task_items(
            cloud_url, api_key, task_wire,
        )
        result["pushed_live"] += pushed
        cursor["task_push_cursor"] = started
    except CloudUnavailable as exc:
        entity_errors.append(f"task: {exc}")
        log.warning("Task sync failed: %s", exc)

    # Step 6: Note sync
    note_pull_since = (
        cursor.get("note_pull_cursor")
        or sync_state.EPOCH
    )
    note_push_since = (
        sync_state.EPOCH
        if is_initial
        else cursor.get("note_push_cursor")
        or sync_state.EPOCH
    )
    try:
        note_cursor, note_up, note_del, note_pulled = (
            pull_and_apply_notes(
                backend, cloud_url, api_key,
                note_pull_since,
            )
        )
        cursor["note_pull_cursor"] = note_cursor
        cursor["note_push_cursor"] = max(
            cursor.get("note_push_cursor") or "",
            note_cursor,
        )
        result["pulled_up"] += note_up
        result["pulled_del"] += note_del

        pushed_del = push_note_tombstones(
            cloud_url, api_key, profile_dir,
        )
        result["pushed_deletes"] += pushed_del
        note_wire = collect_note_changes(
            backend, note_push_since, note_pulled,
        )
        pushed = push_note_items(
            cloud_url, api_key, note_wire,
        )
        result["pushed_live"] += pushed
        cursor["note_push_cursor"] = started
    except CloudUnavailable as exc:
        entity_errors.append(f"note: {exc}")
        log.warning("Note sync failed: %s", exc)

    # Step 7: Pull config updates (e.g. name changed
    # in PWA). Each profile has its own user.yaml, so
    # this is safe for all profiles.
    try:
        _pull_config_updates(
            cloud_url, api_key, profile_dir,
        )
    except Exception:  # noqa: BLE001
        log.warning(
            "Config pull failed", exc_info=True,
        )

    # Step 8: Reference snapshot
    if push_reference_snapshot(
        cloud_url, api_key, customers_fn, tasks_fn,
        settings_file=settings_file,
        profile_dir=profile_dir,
    ):
        cursor["last_snapshot_push"] = started
        result["snapshot_pushed"] = True

    if entity_errors:
        cursor["last_error"] = "; ".join(entity_errors)
        result["error"] = cursor["last_error"]
    else:
        cursor["last_error"] = None
    sync_state.save_cursor(profile_dir, cursor)
    return result
