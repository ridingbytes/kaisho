"""Projects API router.

Projects are the aggregation hub: a customer-scoped
workspace with a description, milestones, and assigned
tasks, time entries, and files. See
`kaisho/services/projects.py`.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...backends import get_backend
from ...config import get_config
from ...services import projects as projects_svc

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _file():
    return get_config().PROJECTS_FILE


class ProjectCreate(BaseModel):
    name: str
    customer: str | None = None
    description: str = ""
    status: str = "ACTIVE"
    contract: str | None = None
    start: str | None = None
    due: str | None = None
    color: str = ""


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    customer: str | None = None
    contract: str | None = None
    start: str | None = None
    due: str | None = None
    color: str | None = None


class MilestoneCreate(BaseModel):
    title: str
    due: str | None = None


class MilestoneUpdate(BaseModel):
    title: str | None = None
    done: bool | None = None
    due: str | None = None


@router.get("")
def list_projects(include_archived: bool = False):
    """List projects, newest-updated first."""
    return projects_svc.list_projects(
        _file(), include_archived=include_archived,
    )


@router.post("", status_code=201)
def create_project(body: ProjectCreate):
    """Create a project."""
    if body.customer:
        get_backend().customers.ensure_customer(body.customer)
    return projects_svc.add_project(
        _file(), name=body.name, customer=body.customer,
        description=body.description, status=body.status,
        contract=body.contract, start=body.start,
        due=body.due, color=body.color,
    )


@router.get("/{project_id}")
def get_project(project_id: str):
    """Return a single project."""
    project = projects_svc.get_project(_file(), project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


@router.patch("/{project_id}")
def update_project(project_id: str, body: ProjectUpdate):
    """Update a project."""
    result = projects_svc.update_project(
        _file(), project_id,
        **body.model_dump(exclude_unset=True),
    )
    if result is None:
        raise HTTPException(404, "Project not found")
    return result


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str):
    """Delete a project. Assigned entities keep their id
    reference but stop resolving; unassign them first if
    that matters."""
    if not projects_svc.delete_project(_file(), project_id):
        raise HTTPException(404, "Project not found")


@router.post("/{project_id}/milestones", status_code=201)
def add_milestone(project_id: str, body: MilestoneCreate):
    """Append a milestone."""
    result = projects_svc.add_milestone(
        _file(), project_id, body.title, due=body.due,
    )
    if result is None:
        raise HTTPException(404, "Project not found")
    return result


@router.patch("/{project_id}/milestones/{milestone_id}")
def update_milestone(
    project_id: str, milestone_id: str,
    body: MilestoneUpdate,
):
    """Update a milestone (title, done, due)."""
    result = projects_svc.update_milestone(
        _file(), project_id, milestone_id,
        title=body.title, done=body.done, due=body.due,
    )
    if result is None:
        raise HTTPException(404, "Milestone not found")
    return result


@router.delete(
    "/{project_id}/milestones/{milestone_id}",
    status_code=204,
)
def delete_milestone(project_id: str, milestone_id: str):
    """Delete a milestone."""
    if not projects_svc.delete_milestone(
        _file(), project_id, milestone_id,
    ):
        raise HTTPException(404, "Milestone not found")


@router.get("/{project_id}/aggregate")
def aggregate_project(project_id: str):
    """Return the project plus its assigned tasks, time
    entries, and a total-minutes rollup.

    Files are fetched separately from the attachments
    endpoint (bucket = project id).
    """
    project = projects_svc.get_project(_file(), project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    backend = get_backend()
    tasks = [
        t for t in backend.tasks.list_tasks(include_done=True)
        if t.get("project") == project_id
    ]
    # Time rolls up to a project two ways: an entry assigned
    # directly, or an entry logged against a task that
    # belongs to the project. The second makes time "just
    # work" once tasks are assigned, with no per-entry step.
    task_ids = {t["id"] for t in tasks}
    entries = [
        e for e in backend.clocks.list_entries(period="all")
        if e.get("project") == project_id
        or (e.get("task_id") and e["task_id"] in task_ids)
    ]
    total_minutes = sum(
        e.get("duration_minutes") or 0 for e in entries
    )
    return {
        "project": project,
        "tasks": tasks,
        "entries": entries,
        "total_minutes": total_minutes,
    }
