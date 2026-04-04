from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...backends import get_backend

router = APIRouter(prefix="/api/clocks", tags=["clocks"])


class QuickBookRequest(BaseModel):
    duration: str   # "2h", "30min"
    customer: str
    description: str


class TimerStart(BaseModel):
    customer: str
    description: str


class EntryUpdate(BaseModel):
    description: str | None = None
    hours: float | None = None


@router.get("/entries")
def list_entries(
    period: str = "today",
    customer: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
):
    return get_backend().clocks.list_entries(
        period=period,
        customer=customer,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/active")
def get_active():
    timer = get_backend().clocks.get_active()
    if timer is None:
        return {"active": False}
    return {"active": True, **timer}


@router.post("/quick-book", status_code=201)
def quick_book(body: QuickBookRequest):
    try:
        return get_backend().clocks.quick_book(
            duration_str=body.duration,
            customer=body.customer,
            description=body.description,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/start", status_code=201)
def start_timer(body: TimerStart):
    try:
        return get_backend().clocks.start(
            customer=body.customer,
            description=body.description,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/stop")
def stop_timer():
    try:
        return get_backend().clocks.stop()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/summary")
def get_summary(period: str = "month"):
    return get_backend().clocks.get_summary(period=period)


@router.patch("/entries")
def update_entry(start: str, body: EntryUpdate):
    result = get_backend().clocks.update_entry(
        start_iso=start,
        description=body.description,
        hours=body.hours,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    return result


@router.delete("/entries", status_code=204)
def delete_entry(start: str):
    found = get_backend().clocks.delete_entry(start_iso=start)
    if not found:
        raise HTTPException(status_code=404, detail="Entry not found")
