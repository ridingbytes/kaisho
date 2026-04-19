import hashlib
from datetime import date

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from ...backends import get_backend

router = APIRouter(prefix="/api/clocks", tags=["clocks"])


# ── iCalendar feed ──────────────────────────────────

def _ical_escape(text: str) -> str:
    """Escape special characters for iCalendar text."""
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _entry_to_vevent(entry: dict) -> str:
    """Convert a clock entry to an iCalendar VEVENT."""
    start = entry.get("start", "")
    end = entry.get("end", "")
    customer = entry.get("customer", "")
    desc = entry.get("description", "")
    contract = entry.get("contract") or ""
    notes = entry.get("notes") or ""
    minutes = entry.get("duration_minutes") or 0

    # UID: prefer sync_id for uniqueness, fall back
    # to content hash for entries without one.
    sync_id = entry.get("sync_id", "")
    if sync_id:
        uid = f"{sync_id}@kaisho"
    else:
        raw = f"{start}-{customer}-{desc}"
        uid = hashlib.sha1(
            raw.encode(), usedforsecurity=False,
        ).hexdigest()[:16]
        uid = f"{uid}@kaisho"

    def fmt(iso: str) -> str:
        """Convert ISO timestamp to iCal format.

        2026-04-14T09:00:00+02:00 -> 20260414T090000
        """
        return iso[:19].replace("-", "").replace(
            ":", "",
        )

    summary = f"[{customer}] {desc}"
    if contract:
        summary += f" ({contract})"

    lines = [
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTART:{fmt(start)}",
    ]
    if end:
        lines.append(f"DTEND:{fmt(end)}")
    elif minutes > 0:
        hours = int(minutes // 60)
        mins = int(minutes % 60)
        lines.append(f"DURATION:PT{hours}H{mins}M")

    lines.append(
        f"SUMMARY:{_ical_escape(summary)}"
    )
    if notes:
        lines.append(
            f"DESCRIPTION:{_ical_escape(notes)}"
        )
    lines.append("END:VEVENT")
    return "\r\n".join(lines)


@router.get(
    "/calendar.ics",
    response_class=PlainTextResponse,
)
def calendar_feed(
    period: str = "month",
    customer: str | None = None,
):
    """iCalendar feed of clock entries.

    Subscribe to this URL in any calendar app
    (iCloud, Google, Outlook, Thunderbird).
    """
    entries = get_backend().clocks.list_entries(
        period=period, customer=customer,
    )
    # Only include entries with a start time
    entries = [
        e for e in entries if e.get("start")
    ]

    parts = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Kaisho//Clock Entries//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Kaisho Time Tracking",
    ]
    for e in entries:
        parts.append(_entry_to_vevent(e))
    parts.append("END:VCALENDAR")
    ical = "\r\n".join(parts) + "\r\n"
    return PlainTextResponse(
        content=ical,
        media_type="text/calendar; charset=utf-8",
    )


class QuickBookRequest(BaseModel):
    duration: str   # "2h", "30min"
    customer: str
    description: str = ""
    task_id: str | None = None
    contract: str | None = None
    date: str | None = None  # YYYY-MM-DD, defaults to today
    notes: str | None = None


class TimerStart(BaseModel):
    customer: str
    description: str = ""
    task_id: str | None = None
    contract: str | None = None


class EntryUpdate(BaseModel):
    customer: str | None = None
    description: str | None = None
    hours: float | None = None
    new_date: date | None = None
    start_time: str | None = None
    task_id: str | None = None
    invoiced: bool | None = None
    notes: str | None = None
    contract: str | None = None


@router.get("/entries")
def list_entries(
    period: str = "today",
    customer: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    task_id: str | None = None,
):
    """List clock entries filtered by period and customer."""
    return get_backend().clocks.list_entries(
        period=period,
        customer=customer,
        from_date=from_date,
        to_date=to_date,
        task_id=task_id,
    )


@router.get("/active")
def get_active():
    """Return the currently running timer, if any."""
    timer = get_backend().clocks.get_active()
    if timer is None:
        return {"active": False}
    return {"active": True, **timer}


@router.post("/quick-book", status_code=201)
def quick_book(body: QuickBookRequest):
    """Book a clock entry with a fixed duration."""
    from ...services import cloud_sync as sync_svc
    try:
        from datetime import date as date_cls
        target_date = (
            date_cls.fromisoformat(body.date)
            if body.date
            else None
        )
        entry = get_backend().clocks.quick_book(
            duration_str=body.duration,
            customer=body.customer,
            description=body.description,
            task_id=body.task_id,
            contract=body.contract,
            target_date=target_date,
            notes=body.notes,
        )
        sync_svc.schedule_push()
        return entry
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/start", status_code=201)
def start_timer(body: TimerStart):
    """Start a new running timer."""
    from ...services import cloud_sync as sync_svc
    try:
        entry = get_backend().clocks.start(
            customer=body.customer,
            description=body.description,
            task_id=body.task_id,
            contract=body.contract,
        )
        sync_svc.schedule_push()
        return entry
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/stop")
def stop_timer():
    """Stop the active timer and save the entry."""
    from ...services import cloud_sync as sync_svc
    try:
        entry = get_backend().clocks.stop()
        sync_svc.schedule_push()
        return entry
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/summary")
def get_summary(period: str = "month"):
    """Return aggregated hours per customer for a period."""
    return get_backend().clocks.get_summary(period=period)


@router.patch("/entries")
def update_entry(start: str, body: EntryUpdate):
    """Update fields of an existing clock entry."""
    from ...services import cloud_sync as sync_svc
    result = get_backend().clocks.update_entry(
        start_iso=start,
        customer=body.customer,
        description=body.description,
        hours=body.hours,
        new_date=body.new_date,
        start_time=body.start_time,
        task_id=body.task_id,
        invoiced=body.invoiced,
        notes=body.notes,
        contract=body.contract,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    sync_svc.schedule_push()
    return result


@router.delete("/entries", status_code=204)
def delete_entry(start: str):
    """Delete a clock entry by its start timestamp.

    Records a sync tombstone so the deletion propagates to
    the cloud on the next push cycle.
    """
    from ...services import cloud_sync as sync_svc
    entry = get_backend().clocks.delete_entry(start_iso=start)
    if entry is None:
        raise HTTPException(
            status_code=404, detail="Entry not found",
        )
    sync_svc.on_local_delete(entry)


# ── Invoice preparation ──────────────────────────────

@router.get("/invoice-preview")
def invoice_preview(
    customer: str,
    contract: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
):
    """Return unbilled entries for a customer/contract."""
    backend = get_backend()
    entries = backend.clocks.list_entries(
        period="all",
        customer=customer,
        from_date=from_date,
        to_date=to_date,
        contract=contract,
    )
    unbilled = [
        e for e in entries if not e.get("invoiced")
    ]
    total_minutes = sum(
        e.get("duration_minutes") or 0 for e in unbilled
    )
    return {
        "customer": customer,
        "contract": contract,
        "from_date": (
            from_date.isoformat() if from_date else None
        ),
        "to_date": (
            to_date.isoformat() if to_date else None
        ),
        "entries": unbilled,
        "total_minutes": total_minutes,
        "total_hours": round(total_minutes / 60, 2),
        "entry_count": len(unbilled),
    }


class BatchBookRequest(BaseModel):
    starts: list[str]


@router.post("/batch-invoice")
def batch_invoice(body: BatchBookRequest):
    """Mark multiple entries as invoiced."""
    backend = get_backend()
    count = 0
    for start_iso in body.starts:
        result = backend.clocks.update_entry(
            start_iso=start_iso, invoiced=True,
        )
        if result is not None:
            count += 1
    return {"invoiced": count}
