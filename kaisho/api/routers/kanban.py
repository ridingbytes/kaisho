from fastapi import APIRouter, Body, HTTPException
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
    github_url: str | None = None


class TaskUpdate(BaseModel):
    status: str | None = None
    title: str | None = None
    customer: str | None = None
    body: str | None = None
    github_url: str | None = None


class TagsUpdate(BaseModel):
    tags: list[str]


@router.get("/tasks")
def list_tasks(
    status: str | None = None,
    customer: str | None = None,
    tag: str | None = None,
    include_done: bool = False,
):
    """List tasks with optional status and customer filters."""
    status_list = [status] if status else None
    return get_backend().tasks.list_tasks(
        status=status_list,
        customer=customer,
        tag=tag,
        include_done=include_done,
    )


@router.put("/tasks/order")
def reorder_tasks(task_ids: list[str] = Body(...)):
    """Reorder tasks within a column."""
    return get_backend().tasks.reorder_tasks(task_ids)


@router.post("/tasks", status_code=201)
def create_task(body: TaskCreate):
    """Create a new kanban task."""
    return get_backend().tasks.add_task(
        customer=body.customer,
        title=body.title,
        status=body.status,
        tags=body.tags,
        body=body.body,
        github_url=body.github_url,
    )


@router.patch("/tasks/{task_id}")
def update_task(task_id: str, body: TaskUpdate):
    """Update task status, title, customer, or body."""
    try:
        backend = get_backend().tasks
        result = None
        if body.status is not None:
            result = backend.move_task(task_id, body.status)
        if (
            body.title is not None
            or body.customer is not None
            or body.body is not None
            or body.github_url is not None
        ):
            result = backend.update_task(
                task_id,
                title=body.title,
                customer=body.customer,
                body=body.body,
                github_url=body.github_url,
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
    """Replace the tags on a task."""
    try:
        return get_backend().tasks.set_tags(task_id, body.tags)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/tasks/{task_id}", status_code=204)
def archive_task(task_id: str):
    """Archive a task."""
    ok = get_backend().tasks.archive_task(task_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Task not found")


@router.get("/archive")
def list_archive():
    """List all archived tasks."""
    return get_backend().tasks.list_archived()


@router.delete("/archive/{task_id}", status_code=204)
def delete_archived_task(task_id: str):
    """Permanently delete an archived task."""
    ok = get_backend().tasks.delete_archived_task(task_id)
    if not ok:
        raise HTTPException(
            status_code=404, detail="Archived task not found"
        )


@router.post("/archive/{task_id}/unarchive", status_code=200)
def unarchive_task(task_id: str):
    """Restore an archived task back to the board."""
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
