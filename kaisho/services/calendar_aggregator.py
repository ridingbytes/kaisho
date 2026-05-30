"""Calendar aggregator.

Single source of truth for the desktop Calendar panel:
fetches events from every connected calendar source -- local
CalDAV (Phase 1) and cloud Google Calendar (when the user
is Pro and has connected it) -- normalizes them to one
event shape, sorts by start, and returns a single list.

Local CalDAV is read directly via ``services.caldav``.
Cloud Google Calendar is read by dispatching the existing
``google_list_events`` cloud tool through
``services.integration_tools``, then normalising Google's
nested ``{dateTime|date}`` shape into the CalDAV shape so
the frontend renders both uniformly.

Failures from one source do not bring down the others: an
unreachable cloud only skips the Google part; a stale CalDAV
account only skips its events. The aggregator's return
includes a ``sources`` list so the panel can show which
sources succeeded vs failed.
"""
import logging
from datetime import datetime
from typing import Iterable

from . import caldav as caldav_svc
from . import integration_tools

log = logging.getLogger(__name__)

GOOGLE_KIND = "google"
GOOGLE_LIST_TOOL = "google_list_events"


# -- Public API ------------------------------------------------------


def list_events(
    frm: datetime, to: datetime,
    sources: Iterable[str] | None = None,
    limit: int | None = None,
) -> dict:
    """Return events across every connected source.

    :param frm: Start of the window (inclusive).
    :param to: End of the window (exclusive).
    :param sources: Restrict to a subset of source ids
        (``"caldav"``, ``"google"``). ``None`` = all
        connected.
    :param limit: Cap on total events returned across
        sources (applied after merge + sort).
    :returns: ``{events: [...], sources: [{id, ok,
        count, error?}]}``.
    """
    requested = (
        set(sources)
        if sources is not None
        else {"caldav", "google"}
    )

    events: list[dict] = []
    source_status: list[dict] = []

    if "caldav" in requested:
        ev, status = _fetch_caldav(frm, to)
        events.extend(ev)
        source_status.append(status)

    if "google" in requested:
        ev, status = _fetch_google(frm, to)
        events.extend(ev)
        source_status.append(status)

    events.sort(key=lambda e: e["start"])
    if limit is not None:
        events = events[:limit]

    return {"events": events, "sources": source_status}


def list_sources() -> list[dict]:
    """Return the set of currently-connected calendar
    sources (id, label, connected flag).

    For the panel header so users know which providers are
    contributing to the view."""
    out = [{
        "id": "caldav",
        "label": "CalDAV",
        "connected": caldav_svc.has_any_account(),
        "account_count": len(caldav_svc.list_accounts()),
    }]
    google_connected = GOOGLE_KIND in (
        integration_tools.connected_kinds()
    )
    out.append({
        "id": "google",
        "label": "Google Calendar",
        "connected": google_connected,
    })
    return out


# -- Per-source fetchers ---------------------------------------------


def _fetch_caldav(
    frm: datetime, to: datetime,
) -> tuple[list[dict], dict]:
    if not caldav_svc.has_any_account():
        return [], _ok_status("caldav", 0)
    try:
        events = caldav_svc.list_events(frm=frm, to=to)
    except caldav_svc.CalDavError as exc:
        log.warning("caldav fetch failed: %s", exc)
        return [], _err_status("caldav", str(exc))
    return events, _ok_status("caldav", len(events))


def _fetch_google(
    frm: datetime, to: datetime,
) -> tuple[list[dict], dict]:
    if GOOGLE_KIND not in integration_tools.connected_kinds():
        return [], _ok_status("google", 0)
    args = {
        "from": frm.isoformat(),
        "to": to.isoformat(),
    }
    resp = integration_tools.dispatch_integration_tool(
        GOOGLE_LIST_TOOL, args,
    )
    if "error" in resp:
        log.warning("google fetch failed: %s", resp["error"])
        return [], _err_status("google", resp["error"])
    raw = resp.get("result") or []
    events = [_normalize_google_event(e) for e in raw]
    return events, _ok_status("google", len(events))


def _normalize_google_event(g: dict) -> dict:
    """Map a Google Calendar event onto the unified shape.

    Google's `start`/`end` is `{dateTime, date, timeZone}`;
    `date` (no time) means all-day. Title is `summary`.
    """
    start_obj = g.get("start") or {}
    end_obj = g.get("end") or {}
    start_dt = (
        start_obj.get("dateTime") or start_obj.get("date")
    )
    end_dt = (
        end_obj.get("dateTime") or end_obj.get("date")
        or start_dt
    )
    all_day = "date" in start_obj and "dateTime" not in start_obj
    return {
        "id": f"google:{g.get('id', '')}",
        "account_id": "google",
        "calendar_id": "primary",
        "uid": g.get("id", ""),
        "title": g.get("summary") or "",
        "start": start_dt or "",
        "end": end_dt or "",
        "all_day": all_day,
        "location": g.get("location"),
        "status": g.get("status"),
        "source": "google",
        "html_link": g.get("html_link"),
    }


# -- Status helpers --------------------------------------------------


def _ok_status(source_id: str, count: int) -> dict:
    return {"id": source_id, "ok": True, "count": count}


def _err_status(source_id: str, error: str) -> dict:
    return {
        "id": source_id, "ok": False,
        "count": 0, "error": error,
    }
