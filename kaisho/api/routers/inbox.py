from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel

from pathlib import Path

from ...backends import get_backend
from ...config import get_config
from ...services import inbox as inbox_service
from ...services import knowledge as kb_service
from ...services.settings import (
    get_kb_sources, load_settings,
)

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
    backend = get_backend()
    backend.customers.ensure_customer(body.customer or "")
    return backend.inbox.add_item(
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
    backend = get_backend()
    if filtered.get("customer"):
        backend.customers.ensure_customer(filtered["customer"])
    try:
        return backend.inbox.update_item(item_id, filtered)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{item_id}/promote", status_code=201)
def promote(item_id: str, body: PromoteRequest):
    """Promote an inbox item to a task."""
    backend = get_backend()
    backend.customers.ensure_customer(body.customer or "")
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
    source_label: str | None = None  # optional for destination="kb"
    folder: str | None = None  # optional subdir under the source


def _move_to_todo(item_id: str, customer: str | None):
    """Promote an inbox item to a kanban task."""
    if not customer:
        raise HTTPException(
            status_code=400,
            detail="customer is required for "
            "destination=todo",
        )
    backend = get_backend()
    backend.customers.ensure_customer(customer)
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


def _pick_kb_source(
    sources: list[dict], label: str | None,
) -> dict:
    """Pick a KB source by label. Falls back to the first
    configured source when label is None."""
    if not sources:
        raise HTTPException(
            status_code=400,
            detail="No KB sources configured",
        )
    if label is None:
        return sources[0]
    for src in sources:
        if src["label"] == label:
            return src
    raise HTTPException(
        status_code=400,
        detail=f"Unknown KB source: {label!r}",
    )


def _move_to_kb(
    item_id: str,
    filename: str | None,
    source_label: str | None,
    folder: str | None,
):
    """Move an inbox item to the knowledge base."""
    if not filename:
        raise HTTPException(
            status_code=400,
            detail="filename is required for "
            "destination=kb",
        )
    cfg = get_config()
    data = load_settings(cfg.SETTINGS_FILE)
    sources = get_kb_sources(data, cfg)
    src = _pick_kb_source(sources, source_label)
    kb_dir = Path(src["path"]).expanduser()
    backend = get_backend()
    try:
        result = inbox_service.move_to_kb(
            inbox_file=backend.inbox.data_file,
            kb_dir=kb_dir,
            item_id=item_id,
            filename=filename,
            subdir=folder,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400, detail=str(e),
        )

    if result.get("metadata"):
        try:
            kb_service.update_metadata(
                sources=sources,
                profile_dir=cfg.PROFILE_DIR,
                rel_path=result["rel_path"],
                patch=result["metadata"],
            )
        except ValueError:
            pass

    return {"path": result["path"]}


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
        iid, body.filename, body.source_label, body.folder,
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
