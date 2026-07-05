"""In-process domain event bus.

Kaisho emits a domain event whenever a task or clock entry
is created, changed, or removed. Subscribers (the webhook
dispatcher, a future rules engine, or tests) register a
handler and receive a normalized event envelope.

Emission is synchronous, cheap, and must never raise into
or block the calling write path: a subscriber that fails
is logged and skipped, never propagated back to the code
that performed the write.

This module is deliberately delivery-agnostic. It knows
nothing about webhooks, HTTP, or the cloud; it only fans
domain events out to whoever subscribed. See
``product/WORKFLOW-AUTOMATION.md`` for the overall design
and the event taxonomy.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Callable

log = logging.getLogger(__name__)

# Event name taxonomy. Kept as constants so the emitters
# and subscribers share one spelling.
TASK_CREATED = "task.created"
TASK_MOVED = "task.moved"
TASK_UPDATED = "task.updated"
TASK_ARCHIVED = "task.archived"
CLOCK_BOOKED = "clock.booked"
CLOCK_TIMER_STARTED = "clock.timer_started"
CLOCK_TIMER_STOPPED = "clock.timer_stopped"
CLOCK_UPDATED = "clock.updated"
CLOCK_DELETED = "clock.deleted"

# The full taxonomy, in a stable order. Consumers (the
# webhook settings UI) render this so a user can pick which
# events an endpoint subscribes to.
ALL_EVENTS = [
    TASK_CREATED,
    TASK_MOVED,
    TASK_UPDATED,
    TASK_ARCHIVED,
    CLOCK_BOOKED,
    CLOCK_TIMER_STARTED,
    CLOCK_TIMER_STOPPED,
    CLOCK_UPDATED,
    CLOCK_DELETED,
]

# A subscriber receives the full event envelope.
EventHandler = Callable[[dict], None]

_subscribers: list[EventHandler] = []


def subscribe(handler: EventHandler) -> Callable[[], None]:
    """Register *handler* to receive every emitted event.

    :param handler: Callable invoked with the event
        envelope dict for every ``emit`` call.
    :returns: A zero-argument function that removes the
        subscription when called.
    """
    _subscribers.append(handler)

    def unsubscribe() -> None:
        try:
            _subscribers.remove(handler)
        except ValueError:
            pass  # Already removed.

    return unsubscribe


def _active_profile() -> str:
    """Return the active profile name for the envelope.

    Imported lazily to avoid a config import at module
    load and to keep this module free of side effects.
    """
    from ..config import get_config

    return get_config().PROFILE


def _now_iso() -> str:
    """UTC timestamp, ISO-8601 with a ``Z`` suffix."""
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def build_event(
    name: str,
    data: dict,
    profile: str | None = None,
) -> dict:
    """Assemble the normalized event envelope.

    :param name: One of the ``*`` event-name constants.
    :param data: Event-specific payload, typically
        ``{"task": {...}, "delta": {...}}`` or
        ``{"entry": {...}}``.
    :param profile: Profile name; resolved from the
        active config when omitted.
    :returns: The envelope dict.
    """
    return {
        "event": name,
        "id": f"evt_{uuid.uuid4().hex}",
        "profile": profile if profile is not None
        else _active_profile(),
        "occurred_at": _now_iso(),
        "data": data,
    }


def emit(name: str, data: dict) -> None:
    """Emit a domain event to all subscribers.

    Never raises: a subscriber that fails is logged and
    the remaining subscribers still run, so a broken
    consumer can never break the write that triggered the
    event. Returns immediately when there are no
    subscribers.

    :param name: One of the ``*`` event-name constants.
    :param data: Event-specific payload.
    """
    if not _subscribers:
        return
    event = build_event(name, data)
    for handler in list(_subscribers):
        _dispatch(handler, event)


def _dispatch(handler: EventHandler, event: dict) -> None:
    """Call one subscriber, isolating its failures.

    A subscriber is untrusted from the emitter's point of
    view: it may raise anything. Catching broadly here is
    intentional and the exception is logged, not swallowed
    silently, so a failing consumer is visible without
    taking down the write path.
    """
    try:
        handler(event)
    except Exception:
        log.exception(
            "Event subscriber failed for %s", event["event"],
        )
