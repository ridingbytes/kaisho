"""Tests for the projects service and the project
assignment field on tasks and clock entries."""
from kaisho.services import projects as projects_svc
from kaisho.services import kanban as kanban_svc
from kaisho.services import clocks as clocks_svc

KEYWORDS = {"TODO", "NEXT", "IN-PROGRESS", "WAIT", "DONE"}


# -- Project CRUD -----------------------------------------

def test_add_and_get_project(org_dir):
    f = org_dir / "projects.org"
    proj = projects_svc.add_project(
        f, "Website Redesign", customer="ACME",
        description="Rebuild the site.", due="2026-06-30",
    )
    assert proj["id"].startswith("P-")
    assert proj["name"] == "Website Redesign"
    assert proj["customer"] == "ACME"
    assert proj["status"] == "ACTIVE"
    assert proj["due"] == "2026-06-30"

    got = projects_svc.get_project(f, proj["id"])
    assert got["description"] == "Rebuild the site."


def test_list_excludes_archived_by_default(org_dir):
    f = org_dir / "projects.org"
    a = projects_svc.add_project(f, "Active")
    projects_svc.add_project(f, "Old", status="ARCHIVED")
    ids = [p["id"] for p in projects_svc.list_projects(f)]
    assert a["id"] in ids
    assert len(ids) == 1
    with_arch = projects_svc.list_projects(
        f, include_archived=True,
    )
    assert len(with_arch) == 2


def test_update_project_and_clear_field(org_dir):
    f = org_dir / "projects.org"
    proj = projects_svc.add_project(
        f, "P", customer="ACME", status="ACTIVE",
    )
    updated = projects_svc.update_project(
        f, proj["id"], status="COMPLETED", customer="",
    )
    assert updated["status"] == "COMPLETED"
    assert updated["customer"] is None


def test_delete_project(org_dir):
    f = org_dir / "projects.org"
    proj = projects_svc.add_project(f, "P")
    assert projects_svc.delete_project(f, proj["id"])
    assert projects_svc.get_project(f, proj["id"]) is None
    assert not projects_svc.delete_project(f, proj["id"])


# -- Milestones -------------------------------------------

def test_milestone_lifecycle(org_dir):
    f = org_dir / "projects.org"
    proj = projects_svc.add_project(f, "P")
    m = projects_svc.add_milestone(
        f, proj["id"], "Kickoff", due="2026-02-01",
    )
    assert m["id"].startswith("M-")
    assert m["done"] is False
    assert m["due"] == "2026-02-01"

    projects_svc.update_milestone(
        f, proj["id"], m["id"], done=True,
    )
    got = projects_svc.get_project(f, proj["id"])
    assert got["milestones"][0]["done"] is True

    assert projects_svc.delete_milestone(
        f, proj["id"], m["id"],
    )
    got = projects_svc.get_project(f, proj["id"])
    assert got["milestones"] == []


# -- Assignment (tasks & clocks) --------------------------

def test_task_carries_project(org_dir):
    todos = org_dir / "todos.org"
    task = kanban_svc.add_task(
        todos, KEYWORDS, "ACME", "Build", project="P-1",
    )
    assert task["project"] == "P-1"
    listed = kanban_svc.list_tasks(todos, KEYWORDS)
    assert listed[0]["project"] == "P-1"

    kanban_svc.update_task(
        todos, KEYWORDS, task["id"], project="",
    )
    assert kanban_svc.list_tasks(
        todos, KEYWORDS,
    )[0]["project"] is None


def test_clock_entry_carries_project(org_dir):
    clocks = org_dir / "clocks.org"
    entry = clocks_svc.quick_book(
        clocks, "1h", "ACME", "Worked",
    )
    assert entry["project"] is None
    clocks_svc.update_clock_entry(
        clocks, start_iso=entry["start"], project="P-1",
    )
    again = clocks_svc.list_entries(clocks, period="all")
    assert again[0]["project"] == "P-1"
