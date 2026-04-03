from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...config import get_config
from ...services import clocks as clock_svc

router = APIRouter(prefix="/api/clocks", tags=["clocks"])


class QuickBookRequest(BaseModel):
    duration: str   # "2h", "30min"
    customer: str
    description: str


class TimerStart(BaseModel):
    customer: str
    description: str


@router.get("/entries")
def list_entries(
    period: str = "today",
    customer: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
):
    cfg = get_config()
    return clock_svc.list_entries(
        clocks_file=cfg.CLOCKS_FILE,
        period=period,
        customer=customer,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/active")
def get_active():
    cfg = get_config()
    timer = clock_svc.get_active_timer(clocks_file=cfg.CLOCKS_FILE)
    if timer is None:
        return {"active": False}
    return {"active": True, **timer}


@router.post("/quick-book", status_code=201)
def quick_book(body: QuickBookRequest):
    cfg = get_config()
    try:
        return clock_svc.quick_book(
            clocks_file=cfg.CLOCKS_FILE,
            duration_str=body.duration,
            customer=body.customer,
            description=body.description,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/start", status_code=201)
def start_timer(body: TimerStart):
    cfg = get_config()
    try:
        return clock_svc.start_timer(
            clocks_file=cfg.CLOCKS_FILE,
            customer=body.customer,
            description=body.description,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/stop")
def stop_timer():
    cfg = get_config()
    try:
        return clock_svc.stop_timer(clocks_file=cfg.CLOCKS_FILE)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/summary")
def get_summary(period: str = "month"):
    cfg = get_config()
    return clock_svc.get_summary(
        clocks_file=cfg.CLOCKS_FILE,
        period=period,
    )
