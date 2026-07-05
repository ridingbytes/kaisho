import json

import click

from ..backends import get_backend
from ..config import get_config
from ..services import projects as projects_svc


def _file():
    return get_config().PROJECTS_FILE


def _format_project(p: dict) -> str:
    """One-line project summary for the list view."""
    name = p["name"][:30].ljust(30)
    status = (p.get("status") or "").ljust(10)
    cust = p.get("customer") or "-"
    ms = p.get("milestones") or []
    done = sum(1 for m in ms if m.get("done"))
    prog = f"{done}/{len(ms)}" if ms else "-"
    return f"{p['id']}  {name} {status} {cust:<12} {prog}"


@click.group()
def project():
    """Manage projects."""


@project.command("list")
@click.option("--all", "include_archived", is_flag=True,
              help="Include archived projects")
@click.option("--json", "as_json", is_flag=True)
def project_list(include_archived, as_json):
    """List projects."""
    projects = projects_svc.list_projects(
        _file(), include_archived=include_archived,
    )
    if as_json:
        click.echo(json.dumps(projects, default=str))
        return
    if not projects:
        click.echo("No projects found.")
        return
    for p in projects:
        click.echo(_format_project(p))


@project.command("show")
@click.argument("project_id")
@click.option("--json", "as_json", is_flag=True)
def project_show(project_id, as_json):
    """Show a project with its tasks and total time."""
    agg = projects_svc.aggregate_project(
        _file(), get_backend(), project_id,
    )
    if agg is None:
        click.echo(f"Project not found: {project_id}", err=True)
        return
    p = agg["project"]
    tasks = agg["tasks"]
    minutes = agg["total_minutes"]
    if as_json:
        click.echo(json.dumps({
            "project": p, "tasks": tasks,
            "total_minutes": minutes,
        }, default=str))
        return
    click.echo(f"Name:        {p['name']}")
    click.echo(f"Id:          {p['id']}")
    click.echo(f"Status:      {p['status']}")
    click.echo(f"Customer:    {p.get('customer') or '-'}")
    if p.get("due"):
        click.echo(f"Due:         {p['due']}")
    click.echo(f"Time logged: {minutes // 60}h {minutes % 60}m")
    if p.get("description"):
        click.echo(f"\n{p['description']}\n")
    if p.get("milestones"):
        click.echo("Milestones:")
        for m in p["milestones"]:
            mark = "x" if m["done"] else " "
            click.echo(f"  [{mark}] {m['title']} ({m['id']})")
    click.echo(f"\nTasks ({len(tasks)}):")
    for t in tasks:
        click.echo(f"  {t['status']:<12} {t['title']}")


@project.command("add")
@click.argument("name")
@click.option("--customer", default=None)
@click.option("--description", default="")
@click.option("--status", default="ACTIVE",
              help="ACTIVE, ON_HOLD, COMPLETED, ARCHIVED")
@click.option("--contract", default=None)
@click.option("--start", default=None, help="YYYY-MM-DD")
@click.option("--due", default=None, help="YYYY-MM-DD")
@click.option("--color", default="")
def project_add(
    name, customer, description, status, contract,
    start, due, color,
):
    """Create a project."""
    if customer:
        get_backend().customers.ensure_customer(customer)
    p = projects_svc.add_project(
        _file(), name, customer=customer,
        description=description, status=status,
        contract=contract, start=start, due=due, color=color,
    )
    click.echo(f"Created project {p['id']}: {p['name']}")


@project.command("rm")
@click.argument("project_id")
def project_rm(project_id):
    """Delete a project."""
    if projects_svc.delete_project(_file(), project_id):
        click.echo(f"Deleted {project_id}")
    else:
        click.echo(f"Project not found: {project_id}", err=True)


@project.command("assign")
@click.argument("task_id")
@click.argument("project_id")
@click.option("--milestone", default=None,
              help="Milestone id within the project")
def project_assign(task_id, project_id, milestone):
    """Assign a task to a project (and optional milestone)."""
    task = get_backend().tasks.update_task(
        task_id, project=project_id,
        milestone=milestone or None,
    )
    click.echo(f"Assigned '{task['title']}' to {project_id}")


@project.group("milestone")
def milestone():
    """Manage project milestones."""


@milestone.command("add")
@click.argument("project_id")
@click.argument("title")
@click.option("--due", default=None, help="YYYY-MM-DD")
def milestone_add(project_id, title, due):
    """Add a milestone to a project."""
    m = projects_svc.add_milestone(
        _file(), project_id, title, due=due,
    )
    if m is None:
        click.echo(f"Project not found: {project_id}", err=True)
        return
    click.echo(f"Added milestone {m['id']}: {m['title']}")
