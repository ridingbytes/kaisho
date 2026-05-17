from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel

from pathlib import Path

from ...backends import get_backend
from ...config import get_config
from ...services import notes as notes_service
from ...services import knowledge as kb_service
from ...services.settings import (
    get_kb_sources, load_settings,
)

router = APIRouter(prefix="/api/notes", tags=["notes"])


class NoteCreate(BaseModel):
    title: str
    body: str = ""
    customer: str | None = None
    task_id: str | None = None
    tags: list[str] = []


class PromoteRequest(BaseModel):
    customer: str


@router.get("/")
def list_notes():
    """List all notes."""
    return get_backend().notes.list_notes()


@router.put("/order")
def reorder_notes(note_ids: list[str] = Body(...)):
    """Persist note order."""
    backend = get_backend()
    return backend.notes.reorder_notes(note_ids)


@router.post("/", status_code=201)
def add_note(body: NoteCreate):
    """Create a new note."""
    backend = get_backend()
    backend.customers.ensure_customer(body.customer or "")
    return backend.notes.add_note(
        title=body.title,
        body=body.body,
        customer=body.customer or None,
        tags=body.tags or None,
        task_id=body.task_id or None,
    )


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: str):
    """Delete a note.

    Records a sync tombstone so the deletion propagates
    to the cloud on the next push cycle.
    """
    from ...services import cloud_sync as sync_svc
    backend = get_backend()
    notes = backend.notes.list_notes()
    note = next(
        (n for n in notes if n["id"] == note_id), None,
    )
    ok = backend.notes.delete_note(note_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Note not found")
    if note:
        sync_svc.on_local_delete_note(note)


class NoteUpdate(BaseModel):
    title: str | None = None
    customer: str | None = None
    task_id: str | None = None
    body: str | None = None
    tags: list[str] | None = None


@router.patch("/{note_id}")
def update_note(note_id: str, body: NoteUpdate):
    """Update note title, body, customer, or tags."""
    updates = {
        k: v
        for k, v in body.model_dump(exclude_unset=True).items()
    }
    backend = get_backend()
    if updates.get("customer"):
        backend.customers.ensure_customer(updates["customer"])
    try:
        return backend.notes.update_note(note_id, updates)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{note_id}/promote", status_code=201)
def promote_note(note_id: str, body: PromoteRequest):
    """Promote a note to a kanban task."""
    backend = get_backend()
    backend.customers.ensure_customer(body.customer or "")
    try:
        return backend.notes.promote_to_task(
            note_id=note_id,
            tasks=backend.tasks,
            customer=body.customer,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


class MoveRequest(BaseModel):
    destination: str  # "task" | "kb" | "archive"
    customer: str | None = None
    filename: str | None = None
    source_label: str | None = None
    folder: str | None = None


def _pick_kb_source(
    sources: list[dict], label: str | None,
) -> dict:
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


@router.post("/{note_id}/move", status_code=201)
def move_note(note_id: str, body: MoveRequest):
    """Move a note to task, KB, or archive."""
    backend = get_backend()
    cfg = get_config()

    if body.destination == "task":
        if not body.customer:
            raise HTTPException(
                status_code=400,
                detail="customer is required for destination=task",
            )
        backend.customers.ensure_customer(body.customer)
        try:
            return backend.notes.promote_to_task(
                note_id=note_id,
                tasks=backend.tasks,
                customer=body.customer,
            )
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    if body.destination == "kb":
        if not body.filename:
            raise HTTPException(
                status_code=400,
                detail="filename is required for destination=kb",
            )
        data = load_settings(cfg.SETTINGS_FILE)
        sources = get_kb_sources(data, cfg)
        src = _pick_kb_source(sources, body.source_label)
        kb_dir = Path(src["path"]).expanduser()
        try:
            result = notes_service.move_to_kb(
                notes_file=backend.notes.data_file,
                kb_dir=kb_dir,
                note_id=note_id,
                filename=body.filename,
                subdir=body.folder,
            )
        except ValueError as e:
            raise HTTPException(
                status_code=400, detail=str(e)
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

    if body.destination == "archive":
        try:
            return backend.notes.update_note(
                note_id, {"archived": "true"}
            )
        except ValueError as e:
            raise HTTPException(
                status_code=404, detail=str(e)
            )

    raise HTTPException(
        status_code=400,
        detail="destination must be 'task', 'kb', or 'archive'",
    )
