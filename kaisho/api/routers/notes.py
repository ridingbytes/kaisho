from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel

from ...backends import get_backend
from ...config import get_config
from ...services import notes as notes_service

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
    return get_backend().notes.add_note(
        title=body.title,
        body=body.body,
        customer=body.customer or None,
        tags=body.tags or None,
        task_id=body.task_id or None,
    )


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: str):
    """Delete a note."""
    ok = get_backend().notes.delete_note(note_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Note not found")


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
    try:
        return get_backend().notes.update_note(note_id, updates)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{note_id}/promote", status_code=201)
def promote_note(note_id: str, body: PromoteRequest):
    """Promote a note to a kanban task."""
    backend = get_backend()
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
        try:
            return notes_service.move_to_kb(
                notes_file=backend.notes.data_file,
                kb_dir=cfg.KNOWLEDGE_DIR.expanduser(),
                note_id=note_id,
                filename=body.filename,
            )
        except ValueError as e:
            raise HTTPException(
                status_code=400, detail=str(e)
            )

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
