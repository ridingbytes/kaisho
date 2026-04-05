from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...backends import get_backend

router = APIRouter(prefix="/api/inbox", tags=["inbox"])


class CaptureRequest(BaseModel):
    text: str
    type: str | None = None
    customer: str | None = None
    body: str | None = None


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


@router.patch("/{item_id}")
def update_item(item_id: str, body: ItemUpdate):
    updates = {
        k: v for k, v in body.model_dump().items() if v is not None
    }
    try:
        return get_backend().inbox.update_item(item_id, updates)
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
