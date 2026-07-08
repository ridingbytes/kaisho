from datetime import date, datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from ...backends import get_backend
from ...services import ical as ical_svc

router = APIRouter(prefix="/api/clocks", tags=["clocks"])


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
    return PlainTextResponse(
        content=ical_svc.build_calendar(entries),
        media_type="text/calendar; charset=utf-8",
    )


class QuickBookRequest(BaseModel):
    duration: str   # "2h", "30min"
    customer: str = ""
    description: str = ""
    task_id: str | None = None
    contract: str | None = None
    date: str | None = None  # YYYY-MM-DD, defaults to today
    notes: str | None = None


class TimerStart(BaseModel):
    customer: str = ""
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
    project: str | None = None


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
    """Return the currently running timer, if any.

    Adds a ``start_unix`` field (Unix epoch seconds) to
    the payload so clients don't have to interpret the
    ``start`` ISO string -- the org file stores naive
    local timestamps, which JavaScript ``new Date()``
    handles correctly but a hand-rolled parser
    (e.g. the Rust tray ticker) easily mistakes for
    UTC, ending up in the future of ``now`` and
    drawing ``00:00`` forever.
    """
    timer = get_backend().clocks.get_active()
    if timer is None:
        return {"active": False}
    start_iso = timer.get("start")
    if start_iso:
        try:
            dt = datetime.fromisoformat(start_iso)
            timer["start_unix"] = int(dt.timestamp())
        except (ValueError, TypeError):
            pass
    return {"active": True, **timer}


@router.post("/quick-book", status_code=201)
def quick_book(body: QuickBookRequest):
    """Book a clock entry with a fixed duration."""
    from ...services import cloud_sync as sync_svc
    from ...services import caldav_sync
    try:
        from datetime import date as date_cls
        target_date = (
            date_cls.fromisoformat(body.date)
            if body.date
            else None
        )
        backend = get_backend()
        backend.customers.ensure_customer(body.customer or "")
        entry = backend.clocks.quick_book(
            duration_str=body.duration,
            customer=body.customer,
            description=body.description,
            task_id=body.task_id,
            contract=body.contract,
            target_date=target_date,
            notes=body.notes,
        )
        sync_svc.schedule_push()
        caldav_sync.schedule_push()
        return entry
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/start", status_code=201)
def start_timer(body: TimerStart):
    """Start a new running timer."""
    from ...services import cloud_sync as sync_svc
    from ...services import caldav_sync

    try:
        backend = get_backend()
        backend.customers.ensure_customer(body.customer or "")
        entry = backend.clocks.start(
            customer=body.customer,
            description=body.description,
            task_id=body.task_id,
            contract=body.contract,
        )
        sync_svc.schedule_push()
        # Running timers are skipped by the CalDAV push
        # (no end_at), but call schedule_push anyway so
        # the call sites stay symmetric and the gate
        # logic lives in one place.
        caldav_sync.schedule_push()
        return entry
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/stop")
def stop_timer(
    apply_rounding: bool = True,
):
    """Stop the active timer and save the entry.

    :param apply_rounding: When false, the profile's
        rounding setting is ignored and the entry is
        recorded at its exact length.
    """
    from ...config import get_config
    from ...services import cloud_sync as sync_svc
    from ...services import caldav_sync
    from ...services import settings as settings_svc
    cfg = get_config()
    if apply_rounding:
        data = settings_svc.load_settings(cfg.SETTINGS_FILE)
        minutes, mode = settings_svc.get_rounding(data)
    else:
        minutes, mode = 0, "nearest"
    try:
        entry = get_backend().clocks.stop(
            rounding_minutes=minutes,
            rounding_mode=mode,
        )
        sync_svc.schedule_push()
        caldav_sync.schedule_push()
        return entry
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


class MergeRequest(BaseModel):
    into_sync_id: str
    from_sync_id: str


@router.post("/merge")
def merge_entries(body: MergeRequest):
    """Merge two stopped clock entries.

    The source is deleted; the target's range and notes
    are extended to cover it. Both entries must share a
    customer.
    """
    from ...services import cloud_sync as sync_svc
    from ...services import caldav_sync
    try:
        result = get_backend().clocks.merge_entries(
            into_sync_id=body.into_sync_id,
            from_sync_id=body.from_sync_id,
        )
        # Record a cloud tombstone for the merged-away
        # entry so the next push tells the cloud (and any
        # other device on the account — PWA, iOS) that the
        # source is gone. Without this, the surviving
        # entry's update propagates but the deletion never
        # does, so other clients keep showing both the
        # originals and the merged result.
        deleted = (result or {}).get("deleted")
        if deleted:
            sync_svc.on_local_delete(deleted)
        sync_svc.schedule_push()
        # Drop the merged-away event from CalDAV before
        # the push cycle so we do not race against an
        # update that would resurrect it.
        if deleted:
            caldav_sync.on_local_delete(deleted)
        caldav_sync.schedule_push()
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=400, detail=str(e),
        )


@router.get("/summary")
def get_summary(period: str = "month"):
    """Return aggregated hours per customer for a period."""
    return get_backend().clocks.get_summary(period=period)


@router.patch("/entries")
def update_entry(
    body: EntryUpdate,
    start: str | None = None,
    sync_id: str | None = None,
):
    """Update fields of an existing clock entry.

    Identify the entry by ``sync_id`` (preferred) or
    ``start``. ``sync_id`` is collision-free; ``start``
    is kept for backward compatibility.
    """
    from ...services import cloud_sync as sync_svc
    from ...services import caldav_sync
    if not sync_id and not start:
        raise HTTPException(
            status_code=400,
            detail="sync_id or start required",
        )
    backend = get_backend()
    if body.customer:
        backend.customers.ensure_customer(body.customer)
    result = backend.clocks.update_entry(
        start_iso=start,
        sync_id=sync_id,
        customer=body.customer,
        description=body.description,
        hours=body.hours,
        new_date=body.new_date,
        start_time=body.start_time,
        task_id=body.task_id,
        invoiced=body.invoiced,
        notes=body.notes,
        contract=body.contract,
        project=body.project,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    sync_svc.schedule_push()
    caldav_sync.schedule_push()
    return result


@router.delete("/entries", status_code=204)
def delete_entry(
    start: str | None = None,
    sync_id: str | None = None,
):
    """Delete a clock entry.

    Identify the entry by ``sync_id`` (preferred) or
    ``start``. Records a sync tombstone so the deletion
    propagates to the cloud on the next push cycle.
    """
    from ...services import cloud_sync as sync_svc
    from ...services import caldav_sync
    if not sync_id and not start:
        raise HTTPException(
            status_code=400,
            detail="sync_id or start required",
        )
    entry = get_backend().clocks.delete_entry(
        start_iso=start, sync_id=sync_id,
    )
    if entry is None:
        raise HTTPException(
            status_code=404, detail="Entry not found",
        )
    sync_svc.on_local_delete(entry)
    caldav_sync.on_local_delete(entry)


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
    from ...services import cloud_sync as sync_svc
    from ...services import caldav_sync

    backend = get_backend()
    count = 0
    for start_iso in body.starts:
        result = backend.clocks.update_entry(
            start_iso=start_iso, invoiced=True,
        )
        if result is not None:
            count += 1
    if count:
        # Every other clocks mutation propagates; without
        # this the invoiced flag stayed local and never
        # reached the cloud / CalDAV peers.
        sync_svc.schedule_push()
        caldav_sync.schedule_push()
    return {"invoiced": count}
