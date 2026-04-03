from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...config import get_config, load_settings_yaml
from ...org.parser import KEYWORDS as DEFAULT_KEYWORDS
from ...services import kanban as kanban_svc
from ...services.settings import get_state_names

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


def _get_keywords() -> set[str]:
    settings = load_settings_yaml()
    names = get_state_names(settings)
    return set(names) if names else DEFAULT_KEYWORDS


@router.get("/tasks")
def list_tasks(
    status: str | None = None,
    customer: str | None = None,
    tag: str | None = None,
    include_done: bool = False,
):
    cfg = get_config()
    keywords = _get_keywords()
    status_list = [status] if status else None
    return kanban_svc.list_tasks(
        todos_file=cfg.TODOS_FILE,
        keywords=keywords,
        status=status_list,
        customer=customer,
        tag=tag,
        include_done=include_done,
    )


@router.post("/tasks", status_code=201)
def create_task(body: TaskCreate):
    cfg = get_config()
    keywords = _get_keywords()
    return kanban_svc.add_task(
        todos_file=cfg.TODOS_FILE,
        keywords=keywords,
        customer=body.customer,
        title=body.title,
        status=body.status,
        tags=body.tags,
    )


@router.patch("/tasks/{task_id}")
def move_task(task_id: str, body: TaskMove):
    cfg = get_config()
    keywords = _get_keywords()
    try:
        return kanban_svc.move_task(
            todos_file=cfg.TODOS_FILE,
            keywords=keywords,
            task_id=task_id,
            new_status=body.status,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/tasks/{task_id}/tags")
def update_tags(task_id: str, body: TagsUpdate):
    cfg = get_config()
    keywords = _get_keywords()
    try:
        return kanban_svc.set_task_tags(
            todos_file=cfg.TODOS_FILE,
            keywords=keywords,
            task_id=task_id,
            tags=body.tags,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/tasks/{task_id}", status_code=204)
def archive_task(task_id: str):
    cfg = get_config()
    keywords = _get_keywords()
    ok = kanban_svc.archive_task(
        todos_file=cfg.TODOS_FILE,
        archive_file=cfg.ARCHIVE_FILE,
        keywords=keywords,
        task_id=task_id,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Task not found")


@router.get("/tags")
def list_tags():
    """Return all known tags with usage counts."""
    cfg = get_config()
    keywords = _get_keywords()
    tasks = kanban_svc.list_tasks(
        todos_file=cfg.TODOS_FILE,
        keywords=keywords,
        include_done=True,
    )
    settings = load_settings_yaml()
    configured = {
        t["name"]: t
        for t in settings.get("tags", [])
    }
    counts: dict[str, int] = {}
    for task in tasks:
        for tag in task.get("tags") or []:
            counts[tag] = counts.get(tag, 0) + 1
    result = []
    for name, count in sorted(counts.items()):
        entry = {"name": name, "count": count}
        if name in configured:
            entry["color"] = configured[name].get("color")
            entry["description"] = configured[name].get("description")
        result.append(entry)
    return result
