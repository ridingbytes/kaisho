from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...backends import get_backend

router = APIRouter(prefix="/api/notes", tags=["notes"])


class NoteCreate(BaseModel):
    title: str
    body: str = ""
    customer: str | None = None
    tags: list[str] = []


class PromoteRequest(BaseModel):
    customer: str


@router.get("/")
def list_notes():
    return get_backend().notes.list_notes()


@router.post("/", status_code=201)
def add_note(body: NoteCreate):
    return get_backend().notes.add_note(
        title=body.title,
        body=body.body,
        customer=body.customer or None,
        tags=body.tags or None,
    )


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: str):
    ok = get_backend().notes.delete_note(note_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Note not found")


class NoteUpdate(BaseModel):
    title: str | None = None
    customer: str | None = None
    body: str | None = None
    tags: list[str] | None = None


@router.patch("/{note_id}")
def update_note(note_id: str, body: NoteUpdate):
    updates = {
        k: v for k, v in body.model_dump().items() if v is not None
    }
    try:
        return get_backend().notes.update_note(note_id, updates)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{note_id}/promote", status_code=201)
def promote_note(note_id: str, body: PromoteRequest):
    backend = get_backend()
    try:
        return backend.notes.promote_to_task(
            note_id=note_id,
            tasks=backend.tasks,
            customer=body.customer,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
