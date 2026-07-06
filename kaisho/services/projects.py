"""Project service.

Projects are the aggregation hub of Kaisho: a customer-
scoped workspace that gathers tasks, time entries, notes,
and files in one place, with a description and milestones.

Storage mirrors the customer entity — a plain org file
(`projects.org`) of top-level project headings, each with
level-2 milestone children. Like customers, projects are
identified by a stable id and are not part of the pluggable
task/clock backend, so this service operates directly on
the file path and the router calls it without a backend
abstraction.

Project heading::

    * ACTIVE Website Redesign
      :PROPERTIES:
      :PROJECT_ID: P-ab12cd34
      :CUSTOMER: Acme
      :CONTRACT: Maintenance 2026
      :START: 2026-01-01
      :DUE: 2026-06-30
      :COLOR: #3b82f6
      :UPDATED_AT: 2026-07-05T09:00:00
      :END:
      Free-form markdown description.
      ** TODO Design mockups
         :PROPERTIES:
         :MILESTONE_ID: M-1a2b3c4d
         :DUE: 2026-02-01
         :END:
      ** DONE Kickoff
"""
import uuid

from collections import defaultdict
from pathlib import Path

from ..org.models import Heading
from ..org.parser import parse_org_file
from ..org.writer import write_org_file
from ..time_utils import local_now

# Project lifecycle states, stored as the heading keyword.
PROJECT_STATES = ["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]

# Milestones use TODO/DONE like tasks. All of these must be
# in the keyword set so the parser recognizes them.
PROJECT_KEYWORDS = set(PROJECT_STATES) | {"TODO", "DONE"}

# Statuses that hide a project from the default listing.
INACTIVE_PROJECT_STATES = frozenset({"ARCHIVED"})


def _now() -> str:
    """Local ISO timestamp, used for ordering."""
    return local_now().isoformat()


# Badge colors, mirroring the customer palette. Assigned
# deterministically from the project id so a project keeps
# the same color without needing randomness.
_PROJECT_COLORS = [
    "#3b82f6", "#8b5cf6", "#ec4899", "#f97316",
    "#10b981", "#06b6d4", "#eab308", "#ef4444",
]


def _color_for(project_id: str) -> str:
    """Pick a stable badge color for a project id."""
    idx = sum(ord(c) for c in project_id) % len(_PROJECT_COLORS)
    return _PROJECT_COLORS[idx]


def generate_project_id() -> str:
    """Return a fresh stable project id."""
    return f"P-{uuid.uuid4().hex[:8]}"


def generate_milestone_id() -> str:
    """Return a fresh stable milestone id."""
    return f"M-{uuid.uuid4().hex[:8]}"


def _heading_to_milestone(child: Heading) -> dict:
    """Convert a milestone child heading to a dict."""
    props = child.properties
    return {
        "id": props.get("MILESTONE_ID", ""),
        "title": child.title.strip(),
        "done": child.keyword == "DONE",
        "due": props.get("DUE") or None,
    }


def _milestone_children(heading: Heading) -> list[Heading]:
    """Return the milestone child headings of a project."""
    return [
        c for c in heading.children
        if c.keyword in ("TODO", "DONE")
    ]


def _heading_to_project(heading: Heading) -> dict:
    """Convert a project heading to a project dict."""
    props = heading.properties
    milestones = [
        _heading_to_milestone(c)
        for c in _milestone_children(heading)
    ]
    pid = props.get("PROJECT_ID", "")
    return {
        "id": pid,
        "name": heading.title.strip(),
        "customer": props.get("CUSTOMER") or None,
        "status": heading.keyword or "ACTIVE",
        "contract": props.get("CONTRACT") or None,
        "start": props.get("START") or None,
        "due": props.get("DUE") or None,
        # Derive a stable color for older projects that
        # predate the auto-assigned COLOR property.
        "color": props.get("COLOR") or _color_for(pid),
        "description": "\n".join(heading.body).strip(),
        "updated_at": props.get("UPDATED_AT", ""),
        "milestones": milestones,
    }


def _find_project_heading(
    org_file, project_id: str,
) -> Heading | None:
    """Find a project heading by its stable id."""
    for heading in org_file.headings:
        if heading.properties.get("PROJECT_ID") == project_id:
            return heading
    return None


def _is_active(project: dict) -> bool:
    """True when the project should show by default."""
    return project["status"] not in INACTIVE_PROJECT_STATES


def list_projects(
    projects_file: Path, include_archived: bool = False,
) -> list[dict]:
    """List projects, newest-updated first."""
    if not projects_file.exists():
        return []
    org_file = parse_org_file(projects_file, PROJECT_KEYWORDS)
    projects = [
        _heading_to_project(h) for h in org_file.headings
        if h.properties.get("PROJECT_ID")
    ]
    if not include_archived:
        projects = [p for p in projects if _is_active(p)]
    projects.sort(
        key=lambda p: p["updated_at"], reverse=True,
    )
    return projects


def get_project(
    projects_file: Path, project_id: str,
) -> dict | None:
    """Return a single project by id, or None."""
    if not projects_file.exists():
        return None
    org_file = parse_org_file(projects_file, PROJECT_KEYWORDS)
    heading = _find_project_heading(org_file, project_id)
    return _heading_to_project(heading) if heading else None


def add_project(
    projects_file: Path,
    name: str,
    customer: str | None = None,
    description: str = "",
    status: str = "ACTIVE",
    contract: str | None = None,
    start: str | None = None,
    due: str | None = None,
    color: str = "",
) -> dict:
    """Create a project and return it."""
    if not projects_file.exists():
        projects_file.parent.mkdir(parents=True, exist_ok=True)
        projects_file.write_text("", encoding="utf-8")
    org_file = parse_org_file(projects_file, PROJECT_KEYWORDS)

    pid = generate_project_id()
    props = {
        "PROJECT_ID": pid,
        "UPDATED_AT": _now(),
        # Auto-assign a stable badge color when none given,
        # so project badges are color-coded like customers.
        "COLOR": color or _color_for(pid),
    }
    if customer:
        props["CUSTOMER"] = customer
    if contract:
        props["CONTRACT"] = contract
    if start:
        props["START"] = start
    if due:
        props["DUE"] = due

    heading = Heading(
        level=1,
        keyword=status if status in PROJECT_STATES else "ACTIVE",
        title=name,
        properties=props,
        body=(
            description.splitlines()
            if description.strip() else []
        ),
        dirty=True,
    )
    org_file.headings.append(heading)
    write_org_file(projects_file, org_file)
    return _heading_to_project(heading)


# Optional string fields that an empty value clears.
_CLEARABLE = {
    "customer": "CUSTOMER",
    "contract": "CONTRACT",
    "start": "START",
    "due": "DUE",
    "color": "COLOR",
}


def update_project(
    projects_file: Path,
    project_id: str,
    name: str | None = None,
    description: str | None = None,
    status: str | None = None,
    customer: str | None = None,
    contract: str | None = None,
    start: str | None = None,
    due: str | None = None,
    color: str | None = None,
) -> dict | None:
    """Update a project. Returns the updated dict, or None.

    A ``None`` argument leaves a field alone; an empty
    string clears the optional properties.
    """
    if not projects_file.exists():
        return None
    org_file = parse_org_file(projects_file, PROJECT_KEYWORDS)
    heading = _find_project_heading(org_file, project_id)
    if heading is None:
        return None

    # A project must keep a name; an empty string is
    # ignored rather than blanking the heading.
    if name:
        heading.title = name
    if status is not None and status in PROJECT_STATES:
        heading.keyword = status
    if description is not None:
        heading.body = (
            description.splitlines()
            if description.strip() else []
        )
    fields = {
        "customer": customer, "contract": contract,
        "start": start, "due": due, "color": color,
    }
    for key, value in fields.items():
        if value is None:
            continue
        prop = _CLEARABLE[key]
        if value:
            heading.properties[prop] = value
        else:
            heading.properties.pop(prop, None)

    heading.properties["UPDATED_AT"] = _now()
    heading.dirty = True
    write_org_file(projects_file, org_file)
    return _heading_to_project(heading)


def project_stats(backend, project_ids: set) -> dict:
    """Return ``{project_id: {task_count, minutes}}`` in a
    single pass over tasks and clock entries.

    Time rolls up two ways (direct assignment or via an
    assigned task), matching :func:`aggregate_project`.
    Shared by the projects list and the dashboard.
    """
    if not project_ids:
        return {}
    tasks = backend.tasks.list_tasks(include_done=True)
    task_project = {
        t["id"]: t["project"]
        for t in tasks
        if t.get("project") in project_ids
    }
    counts: dict = defaultdict(int)
    for pid in task_project.values():
        counts[pid] += 1
    minutes: dict = defaultdict(int)
    for e in backend.clocks.list_entries(period="all"):
        pid = e.get("project")
        if pid not in project_ids:
            pid = task_project.get(e.get("task_id"))
        if pid in project_ids:
            minutes[pid] += e.get("duration_minutes") or 0
    return {
        pid: {
            "task_count": counts.get(pid, 0),
            "minutes": minutes.get(pid, 0),
        }
        for pid in project_ids
    }


def aggregate_project(
    projects_file: Path, backend, project_id: str,
) -> dict | None:
    """Return a project with its assigned tasks, the time
    entries that roll up to it, and the total minutes.

    Time rolls up two ways: an entry assigned directly to
    the project, or an entry logged against a task that
    belongs to the project. Both are additive, so an entry
    assigned to project A whose task belongs to project B
    counts toward both -- expected, since the two links are
    independent.

    ``backend`` is passed in (rather than imported) so this
    service stays backend-agnostic and testable.
    """
    project = get_project(projects_file, project_id)
    if project is None:
        return None
    tasks = [
        t for t in backend.tasks.list_tasks(include_done=True)
        if t.get("project") == project_id
    ]
    task_ids = {t["id"] for t in tasks}
    entries = [
        e for e in backend.clocks.list_entries(period="all")
        if e.get("project") == project_id
        or (e.get("task_id") and e["task_id"] in task_ids)
    ]
    total_minutes = sum(
        e.get("duration_minutes") or 0 for e in entries
    )
    notes = [
        n for n in backend.notes.list_notes()
        if n.get("project") == project_id
    ]
    return {
        "project": project,
        "tasks": tasks,
        "entries": entries,
        "notes": notes,
        "total_minutes": total_minutes,
    }


def delete_project(
    projects_file: Path, project_id: str,
) -> bool:
    """Delete a project. Returns True if it existed."""
    if not projects_file.exists():
        return False
    org_file = parse_org_file(projects_file, PROJECT_KEYWORDS)
    heading = _find_project_heading(org_file, project_id)
    if heading is None:
        return False
    org_file.headings.remove(heading)
    write_org_file(projects_file, org_file)
    return True


# -- Milestones -------------------------------------------

def _touch(heading: Heading) -> None:
    """Mark a project changed so listings re-sort."""
    heading.properties["UPDATED_AT"] = _now()
    heading.dirty = True


def add_milestone(
    projects_file: Path,
    project_id: str,
    title: str,
    due: str | None = None,
) -> dict | None:
    """Append a milestone to a project."""
    if not projects_file.exists():
        return None
    org_file = parse_org_file(projects_file, PROJECT_KEYWORDS)
    heading = _find_project_heading(org_file, project_id)
    if heading is None:
        return None
    props = {"MILESTONE_ID": generate_milestone_id()}
    if due:
        props["DUE"] = due
    child = Heading(
        level=heading.level + 1,
        keyword="TODO",
        title=title,
        properties=props,
        dirty=True,
    )
    heading.children.append(child)
    _touch(heading)
    write_org_file(projects_file, org_file)
    return _heading_to_milestone(child)


def _find_milestone(
    heading: Heading, milestone_id: str,
) -> Heading | None:
    """Find a milestone child by its id.

    An empty id never matches, so a hand-edited org file
    with an id-less milestone child can't be updated or
    deleted out from under itself.
    """
    if not milestone_id:
        return None
    for child in _milestone_children(heading):
        if child.properties.get("MILESTONE_ID") == milestone_id:
            return child
    return None


def update_milestone(
    projects_file: Path,
    project_id: str,
    milestone_id: str,
    title: str | None = None,
    done: bool | None = None,
    due: str | None = None,
) -> dict | None:
    """Update a milestone. Returns the milestone, or None."""
    if not projects_file.exists():
        return None
    org_file = parse_org_file(projects_file, PROJECT_KEYWORDS)
    heading = _find_project_heading(org_file, project_id)
    if heading is None:
        return None
    child = _find_milestone(heading, milestone_id)
    if child is None:
        return None
    if title:
        child.title = title
    if done is not None:
        child.keyword = "DONE" if done else "TODO"
    if due is not None:
        if due:
            child.properties["DUE"] = due
        else:
            child.properties.pop("DUE", None)
    child.dirty = True
    _touch(heading)
    write_org_file(projects_file, org_file)
    return _heading_to_milestone(child)


def delete_milestone(
    projects_file: Path,
    project_id: str,
    milestone_id: str,
) -> bool:
    """Delete a milestone. Returns True if it existed."""
    if not projects_file.exists():
        return False
    org_file = parse_org_file(projects_file, PROJECT_KEYWORDS)
    heading = _find_project_heading(org_file, project_id)
    if heading is None:
        return False
    child = _find_milestone(heading, milestone_id)
    if child is None:
        return False
    heading.children.remove(child)
    _touch(heading)
    write_org_file(projects_file, org_file)
    return True
