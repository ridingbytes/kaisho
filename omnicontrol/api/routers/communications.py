from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...config import get_config
from ...services import communications as comm_service

router = APIRouter(
    prefix="/api/comm", tags=["communications"]
)


def _db():
    return get_config().DB_FILE


class CommCreate(BaseModel):
    subject: str
    direction: str
    channel: str = "email"
    customer: str | None = None
    body: str = ""
    contact: str = ""
    ts: str | None = None
    type: str = ""
    tags: list[str] = []


class CommUpdate(BaseModel):
    subject: str | None = None
    body: str | None = None
    contact: str | None = None
    customer: str | None = None
    type: str | None = None
    tags: list[str] | None = None


@router.get("/")
def list_comms(
    customer: str | None = None,
    channel: str | None = None,
    direction: str | None = None,
    limit: int = 50,
):
    return comm_service.list_comms(
        _db(), customer=customer, channel=channel,
        direction=direction, limit=limit,
    )


@router.post("/", status_code=201)
def add_comm(body: CommCreate):
    try:
        return comm_service.log_comm(
            _db(),
            subject=body.subject,
            direction=body.direction,
            channel=body.channel,
            customer=body.customer,
            body=body.body,
            contact=body.contact,
            ts=body.ts,
            comm_type=body.type,
            tags=body.tags,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{comm_id}")
def patch_comm(comm_id: int, body: CommUpdate):
    updates = body.model_dump(exclude_none=True)
    record = comm_service.update_comm(_db(), comm_id, updates)
    if record is None:
        raise HTTPException(
            status_code=404, detail="Entry not found"
        )
    return record


@router.get("/search")
def search_comms(q: str, limit: int = 50):
    return comm_service.search_comms(_db(), q, limit=limit)


@router.get("/{comm_id}")
def get_comm(comm_id: int):
    record = comm_service.get_comm(_db(), comm_id)
    if record is None:
        raise HTTPException(
            status_code=404, detail="Entry not found"
        )
    return record


@router.delete("/{comm_id}", status_code=204)
def delete_comm(comm_id: int):
    ok = comm_service.delete_comm(_db(), comm_id)
    if not ok:
        raise HTTPException(
            status_code=404, detail="Entry not found"
        )
