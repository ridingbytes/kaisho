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


class TaskMove(BaseModel):
    status: str


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
    )


@router.patch("/tasks/{task_id}")
def move_task(task_id: str, body: TaskMove):
    try:
        return get_backend().tasks.move_task(task_id, body.status)
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
