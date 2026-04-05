from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...backends import get_backend
from ...config import load_settings_yaml

router = APIRouter(prefix="/api/kanban", tags=["kanban"])


class TaskCreate(BaseModel):
    customer: str
    title: str
    status: str = "TODO"
    tags: list[str] = []
    body: str | None = None


class TaskUpdate(BaseModel):
    status: str | None = None
    title: str | None = None
    customer: str | None = None
    body: str | None = None


class TagsUpdate(BaseModel):
    tags: list[str]


@router.get("/tasks")
def list_tasks(
    status: str | None = None,
    customer: str | None = None,
    tag: str | None = None,
    include_done: bool = False,
):
    status_list = [status] if status else None
    return get_backend().tasks.list_tasks(
        status=status_list,
        customer=customer,
        tag=tag,
        include_done=include_done,
    )


@router.post("/tasks", status_code=201)
def create_task(body: TaskCreate):
    return get_backend().tasks.add_task(
        customer=body.customer,
        title=body.title,
        status=body.status,
        tags=body.tags,
        body=body.body,
    )


@router.patch("/tasks/{task_id}")
def update_task(task_id: str, body: TaskUpdate):
    try:
        backend = get_backend().tasks
        result = None
        if body.status is not None:
            result = backend.move_task(task_id, body.status)
        if (
            body.title is not None
            or body.customer is not None
            or body.body is not None
        ):
            result = backend.update_task(
                task_id,
                title=body.title,
                customer=body.customer,
                body=body.body,
            )
        if result is None:
            raise HTTPException(
                status_code=400, detail="No fields to update"
            )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/tasks/{task_id}/tags")
def update_tags(task_id: str, body: TagsUpdate):
    try:
        return get_backend().tasks.set_tags(task_id, body.tags)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/tasks/{task_id}", status_code=204)
def archive_task(task_id: str):
    ok = get_backend().tasks.archive_task(task_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Task not found")


@router.get("/archive")
def list_archive():
    return get_backend().tasks.list_archived()


@router.post("/archive/{task_id}/unarchive", status_code=200)
def unarchive_task(task_id: str):
    ok = get_backend().tasks.unarchive_task(task_id)
    if not ok:
        raise HTTPException(
            status_code=404, detail="Archived task not found"
        )
    return {"ok": True}


@router.get("/tags")
def list_tags():
    """Return all known tags with usage counts and configured metadata."""
    usage = get_backend().tasks.list_all_tags()
    settings = load_settings_yaml()
    configured = {
        t["name"]: t for t in settings.get("tags", [])
    }
    result = []
    for entry in usage:
        name = entry["name"]
        row = {"name": name, "count": entry["count"]}
        if name in configured:
            row["color"] = configured[name].get("color")
            row["description"] = configured[name].get("description")
        result.append(row)
    return result
