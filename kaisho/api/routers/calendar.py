"""Calendar aggregator API router.

Single endpoint the frontend Calendar panel calls. Fans
out to every connected source (local CalDAV + cloud Google
Calendar) and returns a merged, sorted, normalized list.

Pro gate: none. The aggregator silently skips sources the
user has not connected, so Free users see CalDAV-only,
Pro users with Google connected see both, and nobody
gets a 403.
"""
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from ...services import calendar_aggregator as agg

router = APIRouter(
    prefix="/api/calendar", tags=["calendar"],
)


@router.get("/sources")
def list_sources():
    """List connected calendar sources (for the panel
    header). Includes disconnected sources too so the UI
    can offer a 'connect' hint."""
    return {"sources": agg.list_sources()}


@router.get("/events")
def list_events(
    frm: str = Query(..., alias="from"),
    to: str = Query(...),
    source: str | None = Query(
        None,
        description=(
            "Restrict to one source (comma-separated for "
            "multiple, e.g. 'caldav,google')."
        ),
    ),
    limit: int | None = Query(None),
):
    """Return merged events from every connected source.

    ``from`` / ``to`` are ISO-8601 datetimes. The response
    includes a ``sources`` array so the UI can surface
    per-source failures without breaking the panel.
    """
    frm_dt = _parse_iso(frm, "from")
    to_dt = _parse_iso(to, "to")
    sources = (
        {s.strip() for s in source.split(",") if s.strip()}
        if source else None
    )
    return agg.list_events(
        frm=frm_dt, to=to_dt,
        sources=sources, limit=limit,
    )


def _parse_iso(value: str, field: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"{field} must be ISO-8601",
        )
