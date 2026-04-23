from fastapi import APIRouter, Body, HTTPException
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
    """List all inbox items."""
    return get_backend().inbox.list_items()


@router.put("/order")
def reorder_items(
    item_ids: list[str] = Body(...),
):
    """Persist inbox item order."""
    return get_backend().inbox.reorder_items(item_ids)


@router.post("/capture", status_code=201)
def capture(body: CaptureRequest):
    """Capture a new item into the inbox."""
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
    """Delete an inbox item.

    Records a sync tombstone so the deletion propagates
    to the cloud on the next push cycle.
    """
    from ...services import cloud_sync as sync_svc
    backend = get_backend()
    items = backend.inbox.list_items()
    item = next(
        (i for i in items if i["id"] == item_id), None,
    )
    ok = backend.inbox.remove_item(item_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Item not found")
    if item:
        sync_svc.on_local_delete_inbox(item)


class ItemUpdate(BaseModel):
    title: str | None = None
    type: str | None = None
    customer: str | None = None
    body: str | None = None
    channel: str | None = None
    direction: str | None = None


@router.patch("/{item_id}")
def update_item(item_id: str, body: ItemUpdate):
    """Update properties of an inbox item."""
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
    """Promote an inbox item to a task."""
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


def _move_to_todo(item_id: str, customer: str | None):
    """Promote an inbox item to a kanban task."""
    if not customer:
        raise HTTPException(
            status_code=400,
            detail="customer is required for "
            "destination=todo",
        )
    backend = get_backend()
    try:
        return backend.inbox.promote_to_task(
            item_id=item_id,
            tasks=backend.tasks,
            customer=customer,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=404, detail=str(e),
        )


def _move_to_note(item_id: str):
    """Move an inbox item to the notes file."""
    backend = get_backend()
    try:
        return inbox_service.move_to_note(
            inbox_file=backend.inbox.data_file,
            notes_file=backend.notes.data_file,
            item_id=item_id,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=404, detail=str(e),
        )


def _move_to_kb(item_id: str, filename: str | None):
    """Move an inbox item to the knowledge base."""
    if not filename:
        raise HTTPException(
            status_code=400,
            detail="filename is required for "
            "destination=kb",
        )
    cfg = get_config()
    from ...services.settings import (
        get_kb_sources, load_settings,
    )
    data = load_settings(cfg.SETTINGS_FILE)
    sources = get_kb_sources(data, cfg)
    if not sources:
        raise HTTPException(
            status_code=400,
            detail="No KB sources configured",
        )
    from pathlib import Path
    backend = get_backend()
    kb_dir = Path(sources[0]["path"]).expanduser()
    try:
        return inbox_service.move_to_kb(
            inbox_file=backend.inbox.data_file,
            kb_dir=kb_dir,
            item_id=item_id,
            filename=filename,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400, detail=str(e),
        )


def _move_to_archive(item_id: str):
    """Archive an inbox item."""
    try:
        return get_backend().inbox.update_item(
            item_id, {"archived": "true"},
        )
    except ValueError as e:
        raise HTTPException(
            status_code=404, detail=str(e),
        )


_MOVE_HANDLERS = {
    "todo": lambda iid, body: _move_to_todo(
        iid, body.customer,
    ),
    "note": lambda iid, body: _move_to_note(iid),
    "kb": lambda iid, body: _move_to_kb(
        iid, body.filename,
    ),
    "archive": lambda iid, body: _move_to_archive(iid),
}


@router.post("/{item_id}/move", status_code=201)
def move_item(item_id: str, body: MoveRequest):
    """Move an inbox item to another destination."""
    handler = _MOVE_HANDLERS.get(body.destination)
    if handler is None:
        raise HTTPException(
            status_code=400,
            detail="destination must be 'todo', 'note',"
            " 'kb', or 'archive'",
        )
    return handler(item_id, body)
