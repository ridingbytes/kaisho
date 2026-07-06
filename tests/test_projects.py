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


def test_description_with_star_lines_survives(org_dir):
    # A description line starting with ``**`` must not be
    # reparsed as a milestone child and lose the rest of
    # the text (writer sanitizer regression).
    f = org_dir / "projects.org"
    desc = "Intro line\n** Phase two\nmore text"
    proj = projects_svc.add_project(f, "P", description=desc)
    got = projects_svc.get_project(f, proj["id"])
    assert "Intro line" in got["description"]
    assert "Phase two" in got["description"]
    assert "more text" in got["description"]
    assert got["milestones"] == []


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


# -- Backend parity: project/milestone across backends ----

def _sql_backend(tmp_path):
    from kaisho.backends.sql import make_sql_backend
    return make_sql_backend(
        f"sqlite:///{tmp_path / 'p.db'}",
    )


def test_sql_task_project_milestone_roundtrip(tmp_path):
    tasks = _sql_backend(tmp_path)[0]
    t = tasks.add_task(
        customer="ACME", title="T",
        project="P-1", milestone="M-1",
    )
    assert t["project"] == "P-1"
    assert t["milestone"] == "M-1"
    got = tasks.list_tasks(include_done=True)[0]
    assert got["project"] == "P-1"
    assert got["milestone"] == "M-1"
    tasks.update_task(t["id"], project="", milestone="")
    got = tasks.list_tasks(include_done=True)[0]
    assert got["project"] is None
    assert got["milestone"] is None


def test_sql_clock_project_roundtrip(tmp_path):
    clocks = _sql_backend(tmp_path)[1]
    e = clocks.quick_book(
        duration_str="1h", customer="ACME", description="x",
    )
    clocks.update_entry(
        sync_id=e["sync_id"], project="P-1",
    )
    got = clocks.list_entries(period="all")[0]
    assert got["project"] == "P-1"


def test_sql_note_project_roundtrip(tmp_path):
    notes = _sql_backend(tmp_path)[4]
    n = notes.add_note(title="N", project="P-1")
    assert n["project"] == "P-1"
    got = notes.list_notes()[0]
    assert got["project"] == "P-1"
    notes.update_note(n["id"], {"project": ""})
    assert notes.list_notes()[0]["project"] in (None, "")


def test_project_tags_roundtrip(org_dir):
    f = org_dir / "projects.org"
    proj = projects_svc.add_project(
        f, "P", tags=["billing", "urgent"],
    )
    assert set(proj["tags"]) == {"billing", "urgent"}
    got = projects_svc.get_project(f, proj["id"])
    assert set(got["tags"]) == {"billing", "urgent"}
    updated = projects_svc.update_project(
        f, proj["id"], tags=["done"],
    )
    assert updated["tags"] == ["done"]


def test_reap_removed_attachments(org_dir):
    from kaisho.services.attachments_gc import (
        reap_removed_attachments,
    )
    from kaisho.config import get_config
    root = get_config().PROFILE_DIR / "attachments" / "P-1"
    root.mkdir(parents=True, exist_ok=True)
    gone = root / "ab12-photo.png"
    gone.write_bytes(b"x")
    kept = root / "cd34-doc.pdf"
    kept.write_bytes(b"y")
    old = (
        "![p](/api/attachments/P-1/ab12-photo.png) "
        "![d](/api/attachments/P-1/cd34-doc.pdf)"
    )
    new = "![d](/api/attachments/P-1/cd34-doc.pdf)"
    assert reap_removed_attachments(old, new) == 1
    assert not gone.exists()
    assert kept.exists()
