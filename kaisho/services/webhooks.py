"""Outbound webhook subscriptions and delivery.

Phase 2 of `product/WORKFLOW-AUTOMATION.md`. This module
owns the webhook subscriptions (stored in the per-profile
settings under the `webhooks` block) and the dispatcher
that turns domain events into signed HTTP POSTs to
user-configured endpoints (n8n, Make, Zapier, or a plain
webhook receiver).

Delivery is decoupled from the write path. The event bus
handler only enqueues; a background worker thread drains
the queue and performs the HTTP calls with bounded retry,
so a slow or dead endpoint can never delay the task or
clock write that produced the event.

Each request is signed with an HMAC-SHA256 of the raw body
keyed by the subscription secret, sent as
`X-Kaisho-Signature: sha256=<hex>`, matching the GitHub /
Stripe webhook convention receivers already understand.
"""
import hashlib
import hmac
import json
import logging
import queue
import threading
import time
import urllib.error
import urllib.request
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from . import events
from . import settings as settings_svc

log = logging.getLogger(__name__)

# Delivery tuning. Three attempts with a short exponential
# backoff, then the delivery is recorded as failed and kept
# in the log for inspection. No dead-letter replay in v1.
_MAX_ATTEMPTS = 3
_TIMEOUT = 10
_DELIVERY_LOG_MAX = 100

_worker: threading.Thread | None = None
_stop = threading.Event()
_events_q: "queue.Queue" = queue.Queue()
_deliveries: deque = deque(maxlen=_DELIVERY_LOG_MAX)
_deliveries_lock = threading.Lock()
_unsubscribe = None


# -- Subscription storage ---------------------------------

def list_webhooks(path: Path) -> list[dict]:
    """Return the raw subscriptions (secret included)."""
    data = settings_svc.load_settings(path)
    return data.get("webhooks", [])


def _mask(webhook: dict) -> dict:
    """Strip the secret, exposing a `secret_set` flag.

    Mirrors the AI-key masking so the frontend can show
    whether a secret is configured without receiving it.
    """
    secret = webhook.get("secret") or ""
    masked = {k: v for k, v in webhook.items() if k != "secret"}
    masked["secret_set"] = bool(secret)
    return masked


def list_webhooks_safe(path: Path) -> list[dict]:
    """Return subscriptions with secrets masked."""
    return [_mask(w) for w in list_webhooks(path)]


def add_webhook(
    path: Path,
    url: str,
    event_names: list[str] | None,
    secret: str = "",
    active: bool = True,
) -> dict:
    """Create a subscription and return it masked.

    The target domain is added to the URL allowlist so the
    dispatcher's egress guard lets it through. The user
    chose this URL explicitly, so approving its domain here
    is intent, not a bypass; the guard still blocks any URL
    whose domain was never approved (e.g. one hand-edited
    into settings.yaml).
    """
    webhook = {
        "id": f"wh_{uuid.uuid4().hex[:12]}",
        "url": url,
        "events": list(event_names or []),
        "secret": secret or "",
        "active": active,
    }

    def _apply(data: dict) -> None:
        data.setdefault("webhooks", []).append(webhook)

    settings_svc.mutate_settings(path, _apply)
    _approve_domain(path, url)
    return _mask(webhook)


def update_webhook(
    path: Path, webhook_id: str, fields: dict,
) -> dict | None:
    """Patch a subscription. Returns it masked, or None.

    An empty `secret` is ignored so the form can be saved
    without overwriting a stored secret, matching the AI
    settings behavior. A present `url` re-approves its
    domain.
    """
    updated: dict | None = None

    def _apply(data: dict) -> None:
        nonlocal updated
        for webhook in data.get("webhooks", []):
            if webhook["id"] != webhook_id:
                continue
            for key in ("url", "events", "active"):
                if fields.get(key) is not None:
                    webhook[key] = fields[key]
            if fields.get("secret"):
                webhook["secret"] = fields["secret"]
            updated = webhook
            return

    settings_svc.mutate_settings(path, _apply)
    if updated is not None and fields.get("url"):
        _approve_domain(path, fields["url"])
    return _mask(updated) if updated is not None else None


def remove_webhook(path: Path, webhook_id: str) -> bool:
    """Delete a subscription. Returns True if it existed."""
    existed = False

    def _apply(data: dict) -> None:
        nonlocal existed
        webhooks = data.get("webhooks", [])
        kept = [w for w in webhooks if w["id"] != webhook_id]
        existed = len(kept) != len(webhooks)
        data["webhooks"] = kept

    settings_svc.mutate_settings(path, _apply)
    return existed


def _approve_domain(path: Path, url: str) -> None:
    """Add the URL's domain to the settings allowlist."""
    domain = _extract_domain(url)
    if domain:
        settings_svc.add_to_url_allowlist(path, domain)


# -- Signing & egress -------------------------------------

def _extract_domain(url: str) -> str:
    """Return the hostname of a URL (or empty string)."""
    return urlparse(url).hostname or ""


def _domain_allowed(path: Path, domain: str) -> bool:
    """True when the domain is on the settings allowlist."""
    data = settings_svc.load_settings(path)
    return domain in settings_svc.get_url_allowlist(data)


def sign_body(body: bytes, secret: str) -> str:
    """Return the hex HMAC-SHA256 of `body` under `secret`."""
    return hmac.new(
        secret.encode("utf-8"), body, hashlib.sha256,
    ).hexdigest()


def _now_iso() -> str:
    """UTC timestamp, ISO-8601 with a `Z` suffix."""
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _backoff(attempt: int) -> float:
    """Exponential backoff in seconds for attempt N (1..)."""
    return 0.5 * (2 ** (attempt - 1))


# -- Delivery ---------------------------------------------

def _matches(webhook: dict, event_name: str) -> bool:
    """True when the subscription wants this event.

    An empty `events` list means "every event".
    """
    names = webhook.get("events") or []
    return not names or event_name in names


def _post(url: str, body: bytes, headers: dict) -> int:
    """POST the body and return the HTTP status code."""
    req = urllib.request.Request(
        url, data=body, headers=headers, method="POST",
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        return resp.status


def deliver(path: Path, webhook: dict, event: dict) -> dict:
    """Deliver one event to one subscription, with retry.

    Records and returns a delivery entry. Never raises: a
    transport failure is captured in the record's `status`.
    """
    body = json.dumps(event).encode("utf-8")
    domain = _extract_domain(webhook["url"])
    if not _domain_allowed(path, domain):
        return _record(
            webhook, event, "blocked",
            error=f"domain not allowed: {domain}",
        )

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "kaisho-webhooks",
        "X-Kaisho-Event": event["event"],
    }
    secret = webhook.get("secret") or ""
    if secret:
        headers["X-Kaisho-Signature"] = (
            "sha256=" + sign_body(body, secret)
        )

    http_status: int | None = None
    error: str | None = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            status = _post(webhook["url"], body, headers)
            return _record(
                webhook, event, "success",
                http_status=status, attempts=attempt,
            )
        except urllib.error.HTTPError as exc:
            http_status, error = exc.code, f"HTTP {exc.code}"
        except (urllib.error.URLError, OSError) as exc:
            http_status, error = None, str(exc)
        if attempt < _MAX_ATTEMPTS:
            time.sleep(_backoff(attempt))
    return _record(
        webhook, event, "failed",
        http_status=http_status, error=error,
        attempts=_MAX_ATTEMPTS,
    )


def _record(
    webhook: dict,
    event: dict,
    status: str,
    http_status: int | None = None,
    error: str | None = None,
    attempts: int = 1,
) -> dict:
    """Append a delivery record to the in-memory log."""
    record = {
        "id": f"dlv_{uuid.uuid4().hex[:12]}",
        "subscription_id": webhook["id"],
        "url": webhook["url"],
        "event": event["event"],
        "event_id": event.get("id"),
        "status": status,
        "http_status": http_status,
        "error": error,
        "attempts": attempts,
        "at": _now_iso(),
    }
    with _deliveries_lock:
        _deliveries.appendleft(record)
    if status != "success":
        log.warning(
            "webhook delivery %s -> %s: %s (%s)",
            event["event"], webhook["url"], status, error,
        )
    return record


def recent_deliveries(
    subscription_id: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """Return recent delivery records, newest first."""
    with _deliveries_lock:
        items = list(_deliveries)
    if subscription_id:
        items = [
            d for d in items
            if d["subscription_id"] == subscription_id
        ]
    return items[:limit]


def send_test(path: Path, webhook_id: str) -> dict | None:
    """Deliver a synthetic `ping` to one subscription now.

    Runs synchronously so the caller gets the delivery
    result to show in the UI. Returns None if the id is
    unknown.
    """
    webhook = next(
        (w for w in list_webhooks(path)
         if w["id"] == webhook_id),
        None,
    )
    if webhook is None:
        return None
    event = events.build_event(
        "ping", {"message": "Kaisho test event"},
    )
    return deliver(path, webhook, event)


# -- Dispatcher lifecycle ---------------------------------

def _on_event(event: dict) -> None:
    """Bus subscriber: enqueue and return immediately.

    Runs in the thread that performed the write, so it must
    not do any I/O. The worker thread does the delivery.
    """
    _events_q.put(event)


def _dispatch(event: dict) -> None:
    """Fan one event out to every matching subscription."""
    from ..config import get_config

    path = get_config().SETTINGS_FILE
    for webhook in list_webhooks(path):
        if not webhook.get("active", True):
            continue
        if _matches(webhook, event["event"]):
            deliver(path, webhook, event)


def _run() -> None:
    """Worker loop: drain the queue until stopped."""
    while not _stop.is_set():
        try:
            event = _events_q.get(timeout=1.0)
        except queue.Empty:
            continue
        if event is None:
            break
        try:
            _dispatch(event)
        except Exception:
            # A dispatch bug must not kill the worker; the
            # next event still gets a chance.
            log.exception("webhook dispatch failed")


def start() -> None:
    """Subscribe to the event bus and start the worker.

    Idempotent: a second call while running is a no-op.
    """
    global _worker, _unsubscribe
    if _worker is not None and _worker.is_alive():
        return
    _stop.clear()
    _unsubscribe = events.subscribe(_on_event)
    _worker = threading.Thread(
        target=_run, name="webhook-dispatch", daemon=True,
    )
    _worker.start()


def stop() -> None:
    """Stop the worker and unsubscribe from the bus."""
    global _unsubscribe
    _stop.set()
    if _unsubscribe is not None:
        _unsubscribe()
        _unsubscribe = None
    _events_q.put(None)  # Wake the worker so it exits.
