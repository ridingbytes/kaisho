from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...backends import get_backend
from ...config import get_config
from ...services import inbox as inbox_service

router = APIRouter(prefix="/api/inbox", tags=["inbox"])


class CaptureRequest(BaseModel):
    text: str
    type: str | None = None
    customer: str | None = None
    body: str | None = None
    channel: str | None = None
    direction: str | None = None


class PromoteRequest(BaseModel):
    customer: str


@router.get("/")
def list_items():
    return get_backend().inbox.list_items()


@router.post("/capture", status_code=201)
def capture(body: CaptureRequest):
    return get_backend().inbox.add_item(
        text=body.text,
        item_type=body.type,
        customer=body.customer,
        body=body.body,
        channel=body.channel,
        direction=body.direction,
    )


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: str):
    ok = get_backend().inbox.remove_item(item_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Item not found")


class ItemUpdate(BaseModel):
    title: str | None = None
    type: str | None = None
    customer: str | None = None
    body: str | None = None
    channel: str | None = None
    direction: str | None = None


@router.patch("/{item_id}")
def update_item(item_id: str, body: ItemUpdate):
    updates = body.model_dump(exclude_none=False)
    # Keep None values only for channel/direction so empty string clears them;
    # filter out None for other fields to avoid overwriting with None.
    channel_val = updates.pop("channel")
    direction_val = updates.pop("direction")
    filtered = {k: v for k, v in updates.items() if v is not None}
    if channel_val is not None:
        filtered["channel"] = channel_val
    if direction_val is not None:
        filtered["direction"] = direction_val
    try:
        return get_backend().inbox.update_item(item_id, filtered)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{item_id}/promote", status_code=201)
def promote(item_id: str, body: PromoteRequest):
    backend = get_backend()
    try:
        return backend.inbox.promote_to_task(
            item_id=item_id,
            tasks=backend.tasks,
            customer=body.customer,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


class MoveRequest(BaseModel):
    destination: str  # "todo" | "note" | "kb"
    customer: str | None = None  # required for destination="todo"
    filename: str | None = None  # required for destination="kb"


@router.post("/{item_id}/move", status_code=201)
def move_item(item_id: str, body: MoveRequest):
    backend = get_backend()
    cfg = get_config()

    if body.destination == "todo":
        if not body.customer:
            raise HTTPException(
                status_code=400,
                detail="customer is required for destination=todo",
            )
        try:
            return backend.inbox.promote_to_task(
                item_id=item_id,
                tasks=backend.tasks,
                customer=body.customer,
            )
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    if body.destination == "note":
        try:
            return inbox_service.move_to_note(
                inbox_file=backend.inbox.data_file,
                notes_file=backend.notes.data_file,
                item_id=item_id,
            )
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    if body.destination == "kb":
        if not body.filename:
            raise HTTPException(
                status_code=400,
                detail="filename is required for destination=kb",
            )
        try:
            return inbox_service.move_to_kb(
                inbox_file=backend.inbox.data_file,
                kb_dir=cfg.WISSEN_DIR.expanduser(),
                item_id=item_id,
                filename=body.filename,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    if body.destination == "archive":
        ok = backend.inbox.remove_item(item_id)
        if not ok:
            raise HTTPException(
                status_code=404, detail="Item not found"
            )
        return {"ok": True}

    raise HTTPException(
        status_code=400,
        detail="destination must be 'todo', 'note', 'kb',"
        " or 'archive'",
    )
