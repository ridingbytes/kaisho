"""CalDAV API router (Phase 1: local-only).

Exposes account CRUD, connection testing, calendar listing,
and event reads for the desktop UI. All endpoints run
against the local sidecar and never call out to the cloud.

Pro gate: none. Matches the local GitHub precedent --
local-first integrations are free for every plan.
"""
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ...services import caldav as caldav_svc
from ...services import caldav_sync as caldav_sync_svc
from ...services.caldav_presets import list_presets

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/caldav", tags=["caldav"])


# -- Request models --------------------------------------------------


class TestConnectionBody(BaseModel):
    preset: str
    username: str
    password: str
    host: str = ""
    url: str = ""


class AddAccountBody(BaseModel):
    preset: str
    username: str
    password: str
    label: str = ""
    host: str = ""
    url: str = ""


class EnabledCalendarsBody(BaseModel):
    calendars: list[str]


class PushConfigBody(BaseModel):
    enabled: bool
    calendar_id: str = ""


# -- Helpers ---------------------------------------------------------


def _wrap(fn, *args, **kwargs):
    """Run a service call, translating CalDavError to a
    400 so the UI gets the human message instead of a
    stack trace."""
    try:
        return fn(*args, **kwargs)
    except caldav_svc.CalDavError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# -- Endpoints -------------------------------------------------------


@router.get("/presets")
def get_presets():
    """List provider presets for the connect dropdown."""
    return {"presets": list_presets()}


@router.get("/accounts")
def list_accounts():
    """List connected accounts (no secrets)."""
    return {"accounts": caldav_svc.list_accounts()}


@router.post("/accounts")
def add_account(body: AddAccountBody):
    """Add an account after verifying the connection."""
    record = _wrap(
        caldav_svc.add_account,
        preset=body.preset,
        username=body.username,
        password=body.password,
        label=body.label,
        host=body.host,
        url=body.url,
    )
    return {"account": record}


@router.delete("/accounts/{account_id}")
def remove_account(account_id: str):
    removed = caldav_svc.remove_account(account_id)
    if not removed:
        raise HTTPException(
            status_code=404, detail="unknown account",
        )
    return {"removed": account_id}


@router.post("/accounts/{account_id}/calendars")
def set_enabled_calendars(
    account_id: str, body: EnabledCalendarsBody,
):
    """Persist the per-account list of calendars to include
    in event reads. Empty list = include all."""
    ok = caldav_svc.set_enabled_calendars(
        account_id, body.calendars,
    )
    if not ok:
        raise HTTPException(
            status_code=404, detail="unknown account",
        )
    return {"updated": True}


@router.post("/accounts/{account_id}/refresh")
def refresh_account(account_id: str):
    dropped = caldav_svc.refresh_account(account_id)
    return {"cache_entries_dropped": dropped}


@router.get("/accounts/{account_id}/calendars")
def list_calendars(account_id: str):
    """List the calendars on one account (for the
    per-account enable/disable UI)."""
    cals = _wrap(caldav_svc.list_calendars, account_id)
    return {"calendars": cals}


@router.get("/accounts/{account_id}/push-config")
def get_push_config(account_id: str):
    """Per-account push toggle + selected calendar.

    Returns ``{"enabled": bool, "calendar_id": str}``
    where an empty ``calendar_id`` means "use the
    auto-created Kaisho calendar."""
    cfg = caldav_svc.get_push_config(account_id)
    if cfg is None:
        raise HTTPException(
            status_code=404, detail="unknown account",
        )
    return cfg


@router.post("/accounts/{account_id}/push-config")
def set_push_config(account_id: str, body: PushConfigBody):
    """Persist the per-account push config.

    Side effect when ``enabled=True`` and ``calendar_id``
    is empty: discover or create the dedicated "Kaisho"
    calendar on the account.
    """
    cfg = _wrap(
        caldav_svc.set_push_config,
        account_id, body.enabled, body.calendar_id,
    )
    return cfg


@router.get("/accounts/{account_id}/push-health")
def get_push_health(account_id: str):
    """Per-account sync health for the Settings indicator.

    Returns the per_account state map: ``failure_count``,
    ``last_error``, ``last_success_at``, ``degraded``.
    An account that has never been pushed reports zeros
    so the UI does not have to special-case None.
    """
    if caldav_svc.get_account(account_id) is None:
        raise HTTPException(
            status_code=404, detail="unknown account",
        )
    health = caldav_sync_svc.get_account_health(
        account_id,
    )
    if health is None:
        return {
            "failure_count": 0,
            "last_error": None,
            "last_success_at": None,
            "degraded": False,
        }
    return {
        "failure_count": int(
            health.get("failure_count") or 0,
        ),
        "last_error": health.get("last_error"),
        "last_success_at": health.get(
            "last_success_at",
        ),
        "degraded": bool(health.get("degraded")),
    }


@router.post("/accounts/{account_id}/push-sync")
def push_sync(account_id: str):
    """Run one reconciliation pass synchronously.

    Powers the 'Sync now' button. Returns the summary
    counter so the UI can show a 'pushed N events' toast
    and the refreshed health in one round-trip.
    """
    if caldav_svc.get_account(account_id) is None:
        raise HTTPException(
            status_code=404, detail="unknown account",
        )
    summary = caldav_sync_svc.sync_now()
    return {
        "summary": summary,
        "health": caldav_sync_svc.get_account_health(
            account_id,
        ) or {
            "failure_count": 0, "last_error": None,
            "last_success_at": None, "degraded": False,
        },
    }


@router.post("/test-connection")
def test_connection(body: TestConnectionBody):
    """Preflight call invoked by the Settings form before
    saving an account."""
    from ...services.caldav_presets import resolve_url
    try:
        url = resolve_url(
            body.preset, host=body.host,
            username=body.username, url=body.url,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail=str(exc),
        )
    return _wrap(
        caldav_svc.test_connection,
        url, body.username, body.password,
    )


@router.get("/events")
def list_events(
    frm: str = Query(..., alias="from"),
    to: str = Query(...),
    account_id: str | None = Query(None),
    calendar: str | None = Query(None),
    limit: int | None = Query(None),
):
    """Return events between ``from`` and ``to`` (ISO-8601
    datetimes). Optional ``account_id`` / ``calendar``
    filter; ``limit`` caps the result count."""
    frm_dt = _parse_iso(frm, "from")
    to_dt = _parse_iso(to, "to")
    events = _wrap(
        caldav_svc.list_events,
        frm=frm_dt, to=to_dt,
        account_id=account_id, calendar=calendar,
        limit=limit,
    )
    return {"events": events}


@router.get("/events/{event_id}")
def get_event(event_id: str):
    event = _wrap(caldav_svc.get_event, event_id)
    return {"event": event}


# -- Parsing helpers -------------------------------------------------


def _parse_iso(value: str, field: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"{field} must be ISO-8601",
        )
