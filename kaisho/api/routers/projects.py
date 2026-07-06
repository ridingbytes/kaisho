"""Projects API router.

Projects are the aggregation hub: a customer-scoped
workspace with a description, milestones, and assigned
tasks, time entries, and files. See
`kaisho/services/projects.py`.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...backends import active_config, get_backend
from ...services import projects as projects_svc

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _file():
    return active_config().PROJECTS_FILE


class ProjectCreate(BaseModel):
    name: str
    customer: str | None = None
    description: str = ""
    status: str = "ACTIVE"
    contract: str | None = None
    start: str | None = None
    due: str | None = None
    color: str = ""
    tags: list[str] = []


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    customer: str | None = None
    contract: str | None = None
    start: str | None = None
    due: str | None = None
    color: str | None = None
    tags: list[str] | None = None


class MilestoneCreate(BaseModel):
    title: str
    due: str | None = None


class MilestoneUpdate(BaseModel):
    title: str | None = None
    done: bool | None = None
    due: str | None = None


@router.get("")
def list_projects(include_archived: bool = False):
    """List projects (newest-updated first) with each
    project's task count and logged minutes attached."""
    projects = projects_svc.list_projects(
        _file(), include_archived=include_archived,
    )
    stats = projects_svc.project_stats(
        get_backend(), {p["id"] for p in projects},
    )
    for p in projects:
        p.update(
            stats.get(
                p["id"], {"task_count": 0, "minutes": 0},
            )
        )
    return projects


@router.post("", status_code=201)
def create_project(body: ProjectCreate):
    """Create a project."""
    if body.customer:
        get_backend().customers.ensure_customer(body.customer)
    return projects_svc.add_project(
        _file(), name=body.name, customer=body.customer,
        description=body.description, status=body.status,
        contract=body.contract, start=body.start,
        due=body.due, color=body.color, tags=body.tags,
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
    if body.customer:
        get_backend().customers.ensure_customer(body.customer)
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
    result = projects_svc.aggregate_project(
        _file(), get_backend(), project_id,
    )
    if result is None:
        raise HTTPException(404, "Project not found")
    return result
