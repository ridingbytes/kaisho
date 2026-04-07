"""CLI commands for managing notes."""
import json
import sys

import click

from ..backends import get_backend
from . import open_in_editor


def _format_note(note: dict) -> str:
    """Format a note for display."""
    nid = note.get("id", "?")
    title = note.get("title", "")
    customer = note.get("customer") or ""
    tags = note.get("tags") or []
    tag_str = (
        " :" + ":".join(tags) + ":"
    ) if tags else ""
    cust_str = f" [{customer}]" if customer else ""
    created = (
        note.get("created") or ""
    ).strip("[]")[:10]
    return f"#{nid:<3}  {title}{cust_str}{tag_str}  {created}"


@click.group()
def notes():
    """Manage notes."""


@notes.command("add")
@click.argument("title", nargs=-1, required=True)
@click.option("--body", "-b", default="",
              help="Note body text")
@click.option("--customer", "-c", default=None,
              help="Customer name")
@click.option("--tag", "tags", multiple=True,
              help="Add tag (repeatable)")
@click.option("--task", "task_id", default=None,
              help="Link to task ID")
@click.option("--json", "as_json", is_flag=True)
def notes_add(title, body, customer, tags,
              task_id, as_json):
    """Add a new note."""
    result = get_backend().notes.add_note(
        title=" ".join(title),
        body=body,
        customer=customer,
        tags=list(tags) if tags else None,
        task_id=task_id,
    )
    if as_json:
        click.echo(json.dumps(result, default=str))
    else:
        click.echo(f"Added note: {result['title']}")


@notes.command("list")
@click.option("--customer", "-c", default=None,
              help="Filter by customer")
@click.option("--json", "as_json", is_flag=True)
def notes_list(customer, as_json):
    """List all notes."""
    all_notes = get_backend().notes.list_notes()
    if customer:
        all_notes = [
            n for n in all_notes
            if (n.get("customer") or "").lower()
            == customer.lower()
        ]
    if as_json:
        click.echo(json.dumps(all_notes, default=str))
        return
    if not all_notes:
        click.echo("No notes found.")
        return
    for note in all_notes:
        click.echo(_format_note(note))


@notes.command("show")
@click.argument("note_id")
@click.option("--json", "as_json", is_flag=True)
def notes_show(note_id, as_json):
    """Show a note by ID."""
    all_notes = get_backend().notes.list_notes()
    note = next(
        (n for n in all_notes
         if n.get("id") == note_id),
        None,
    )
    if not note:
        click.echo(
            f"Note not found: {note_id}", err=True,
        )
        sys.exit(1)
    if as_json:
        click.echo(json.dumps(note, default=str))
        return
    click.echo(f"Title:    {note['title']}")
    if note.get("customer"):
        click.echo(f"Customer: {note['customer']}")
    if note.get("tags"):
        click.echo(
            f"Tags:     {', '.join(note['tags'])}"
        )
    if note.get("created"):
        click.echo(f"Created:  {note['created']}")
    if note.get("body"):
        click.echo(f"\n{note['body']}")


@notes.command("delete")
@click.argument("note_id")
@click.option("--yes", "-y", is_flag=True,
              help="Skip confirmation")
def notes_delete(note_id, yes):
    """Delete a note by ID."""
    if not yes:
        click.confirm(
            f"Delete note #{note_id}?", abort=True,
        )
    ok = get_backend().notes.delete_note(note_id)
    if ok:
        click.echo(f"Deleted #{note_id}")
    else:
        click.echo(
            f"Note not found: {note_id}", err=True,
        )
        sys.exit(1)


@notes.command("edit")
def notes_edit():
    """Open the notes file in $EDITOR."""
    f = get_backend().notes.data_file
    if f is None:
        click.echo(
            "This backend has no editable file.",
            err=True,
        )
        sys.exit(1)
    open_in_editor(f)
