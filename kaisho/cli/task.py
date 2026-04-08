import json
import re
import sys

import click

from ..backends import get_backend
from . import open_in_editor

CUSTOMER_STRIP_RE = re.compile(r"^\[[^\]]+\]\s*")


def _format_task_line(task: dict) -> str:
    """Format a task for display."""
    task_id = task.get("id", "?")
    status = (task.get("status") or "").ljust(12)
    customer = task.get("customer") or "-"
    customer_col = f"[{customer}]"
    title = CUSTOMER_STRIP_RE.sub("", task.get("title") or "")
    tags = task.get("tags") or []
    tag_str = (":" + ":".join(tags) + ":") if tags else ""
    created = (task.get("created") or "").strip("[]")[:10]
    parts = [f"#{task_id:<3}", status, customer_col, title]
    if tag_str:
        parts.append(tag_str)
    parts.append(created)
    return "  ".join(parts)


@click.group()
def task():
    """Manage tasks."""


@task.command("add")
@click.argument("customer_name")
@click.argument("title", nargs=-1, required=True)
@click.option("--tag", "tags", multiple=True, help="Add tag")
@click.option("--status", default="TODO", help="Initial status")
@click.option("--body", "-b", default=None,
              help="Task body/description")
@click.option("--github-url", default=None,
              help="GitHub issue/PR URL")
@click.option("--json", "as_json", is_flag=True,
              help="JSON output")
def task_add(customer_name, title, tags, status,
             body, github_url, as_json):
    """Add a new task."""
    result = get_backend().tasks.add_task(
        customer=customer_name,
        title=" ".join(title),
        status=status,
        tags=list(tags),
        body=body,
        github_url=github_url,
    )
    if as_json:
        click.echo(json.dumps(result, default=str))
    else:
        click.echo(f"Added task: {result['title']}")


@task.command("list")
@click.option("--customer", default=None, help="Filter by customer")
@click.option("--status", "status_filter", default=None,
              help="Filter by status")
@click.option("--tag", default=None, help="Filter by tag")
@click.option("--all", "include_all", is_flag=True,
              help="Include DONE and CANCELLED")
@click.option("--json", "as_json", is_flag=True, help="JSON output")
def task_list(customer, status_filter, tag, include_all, as_json):
    """List tasks."""
    status_list = [status_filter] if status_filter else None
    tasks = get_backend().tasks.list_tasks(
        status=status_list,
        customer=customer,
        tag=tag,
        include_done=include_all,
    )
    if as_json:
        click.echo(json.dumps(tasks, default=str))
        return
    if not tasks:
        click.echo("No tasks found.")
        return
    for t in tasks:
        click.echo(_format_task_line(t))


@task.command("move")
@click.argument("task_id")
@click.argument("new_status")
@click.option("--json", "as_json", is_flag=True)
def task_move(task_id, new_status, as_json):
    """Move a task to a new status."""
    result = get_backend().tasks.move_task(task_id, new_status)
    if as_json:
        click.echo(json.dumps(result, default=str))
    else:
        click.echo(f"Moved task {task_id} to {new_status}")


def _move_to(task_id: str, new_status: str) -> None:
    """Move task to given status and print confirmation."""
    get_backend().tasks.move_task(task_id, new_status)
    click.echo(f"Task {task_id} -> {new_status}")


@task.command("done")
@click.argument("task_id")
def task_done(task_id):
    """Mark a task as DONE."""
    _move_to(task_id, "DONE")


@task.command("next")
@click.argument("task_id")
def task_next(task_id):
    """Mark a task as NEXT."""
    _move_to(task_id, "NEXT")


@task.command("wait")
@click.argument("task_id")
def task_wait(task_id):
    """Mark a task as WAIT."""
    _move_to(task_id, "WAIT")


@task.command("cancel")
@click.argument("task_id")
def task_cancel(task_id):
    """Mark a task as CANCELLED."""
    _move_to(task_id, "CANCELLED")


@task.command("show")
@click.argument("task_id")
@click.option("--json", "as_json", is_flag=True)
def task_show(task_id, as_json):
    """Show details for a task."""
    tasks = get_backend().tasks.list_tasks(
        include_done=True,
    )
    t = next(
        (t for t in tasks if t["id"] == task_id),
        None,
    )
    if not t:
        click.echo(
            f"Task not found: {task_id}", err=True,
        )
        sys.exit(1)
    if as_json:
        click.echo(json.dumps(t, default=str))
        return
    click.echo(f"ID:       {t['id']}")
    click.echo(f"Status:   {t['status']}")
    click.echo(f"Customer: {t.get('customer', '')}")
    title = CUSTOMER_STRIP_RE.sub(
        "", t.get("title", ""),
    )
    click.echo(f"Title:    {title}")
    if t.get("tags"):
        click.echo(
            f"Tags:     {', '.join(t['tags'])}"
        )
    if t.get("github_url"):
        click.echo(
            f"GitHub:   {t['github_url']}"
        )
    if t.get("created"):
        click.echo(f"Created:  {t['created']}")
    if t.get("body"):
        click.echo(f"\n{t['body']}")


@task.command("update")
@click.argument("task_id")
@click.option("--title", default=None,
              help="New title")
@click.option("--customer", default=None,
              help="New customer")
@click.option("--body", "-b", default=None,
              help="New body text")
@click.option("--github-url", default=None,
              help="GitHub issue/PR URL")
@click.option("--json", "as_json", is_flag=True)
def task_update(task_id, title, customer, body,
                github_url, as_json):
    """Update a task's fields."""
    result = get_backend().tasks.update_task(
        task_id=task_id,
        title=title,
        customer=customer,
        body=body,
        github_url=github_url,
    )
    if as_json:
        click.echo(json.dumps(result, default=str))
    else:
        click.echo(f"Updated task {task_id}")


@task.command("delete")
@click.argument("task_id")
@click.option("--yes", "-y", is_flag=True,
              help="Skip confirmation")
def task_delete(task_id, yes):
    """Delete a task by archiving it."""
    if not yes:
        click.confirm(
            f"Archive task {task_id}?", abort=True,
        )
    ok = get_backend().tasks.archive_task(task_id)
    if ok:
        click.echo(f"Archived task {task_id}")
    else:
        click.echo(
            f"Task not found: {task_id}", err=True,
        )
        sys.exit(1)


@task.command("tag")
@click.argument("task_id")
@click.argument("tags", nargs=-1, required=True)
@click.option("--json", "as_json", is_flag=True)
def task_tag(task_id, tags, as_json):
    """Set or modify tags on a task.

    Prefix with + to add, - to remove, or bare to replace all tags.
    """
    backend = get_backend()
    has_modifiers = any(t.startswith(("+", "-")) for t in tags)

    if has_modifiers:
        all_tasks = backend.tasks.list_tasks(include_done=True)
        current_task = None
        if task_id.isdigit():
            idx = int(task_id) - 1
            if 0 <= idx < len(all_tasks):
                current_task = all_tasks[idx]
        if current_task is None:
            for t in all_tasks:
                if task_id.lower() in (t.get("title") or "").lower():
                    current_task = t
                    break
        current = list(current_task["tags"]) if current_task else []
        for tag in tags:
            if tag.startswith("+"):
                tname = tag[1:]
                if tname not in current:
                    current.append(tname)
            elif tag.startswith("-"):
                tname = tag[1:]
                current = [t for t in current if t != tname]
            else:
                current = [tag]
        new_tags = current
    else:
        new_tags = list(tags)

    result = backend.tasks.set_tags(task_id, new_tags)
    if as_json:
        click.echo(json.dumps(result, default=str))
    else:
        tag_str = ":" + ":".join(new_tags) + ":" if new_tags else "(none)"
        click.echo(f"Tags set for task {task_id}: {tag_str}")


@task.command("archive")
@click.argument("task_id")
def task_archive(task_id):
    """Archive a task."""
    success = get_backend().tasks.archive_task(task_id)
    if success:
        click.echo(f"Task {task_id} archived.")
    else:
        click.echo(f"Task {task_id} not found.", err=True)
        sys.exit(1)


@task.command("edit")
def task_edit():
    """Open the task file in $EDITOR."""
    f = get_backend().tasks.data_file
    if f is None:
        click.echo("This backend has no editable file.", err=True)
        sys.exit(1)
    open_in_editor(f)
