import json
import re
import sys

import click

from ..backends import get_backend
from . import open_in_editor

_TITLE_STRIP_RE = re.compile(
    r"^(?:EMAIL|LEAD|IDEE|NOTIZ|NOTE|IDEA)\s+", re.IGNORECASE
)
_CUSTOMER_STRIP_RE = re.compile(r"^\[[^\]]+\]\s*")


def _clean_title(title: str) -> str:
    """Remove type prefix and [CUSTOMER] prefix from title."""
    title = _TITLE_STRIP_RE.sub("", title)
    title = _CUSTOMER_STRIP_RE.sub("", title)
    return title.strip()


def _format_item(item: dict) -> str:
    """Format an inbox item for display."""
    idx = item.get("id", "?")
    item_type = (item.get("type") or "NOTIZ").ljust(6)
    customer = item.get("customer") or "-"
    customer_str = f"[{customer}]"
    title = _clean_title(item.get("title") or "")
    created = (item.get("created") or "").strip("[]")[:10]
    return f"#{idx:<3} {item_type} {customer_str}  {title}  {created}"


@click.group()
def inbox():
    """Manage inbox items."""


@inbox.command("add")
@click.argument("text", nargs=-1, required=True)
@click.option("--type", "item_type", default=None,
              help="Item type: EMAIL, IDEE, LEAD, NOTIZ")
@click.option("--customer", default=None, help="Customer name")
@click.option("--json", "as_json", is_flag=True)
def inbox_add(text, item_type, customer, as_json):
    """Add an item to the inbox.

    Pass - as TEXT to read from stdin.
    """
    joined = " ".join(text)
    if joined == "-":
        joined = sys.stdin.read().strip()
    result = get_backend().inbox.add_item(
        text=joined,
        item_type=item_type,
        customer=customer,
    )
    if as_json:
        click.echo(json.dumps(result, default=str))
    else:
        click.echo(f"Added: {_format_item(result)}")


@inbox.command("list")
@click.option("--type", "type_filter", default=None,
              help="Filter by type")
@click.option("--json", "as_json", is_flag=True)
def inbox_list(type_filter, as_json):
    """List inbox items."""
    items = get_backend().inbox.list_items()
    if type_filter:
        items = [i for i in items if i.get("type") == type_filter]
    if as_json:
        click.echo(json.dumps(items, default=str))
        return
    if not items:
        click.echo("Inbox is empty.")
        return
    for item in items:
        click.echo(_format_item(item))


@inbox.command("promote")
@click.argument("item_id")
@click.option("--customer", required=True, help="Target customer")
@click.option("--json", "as_json", is_flag=True)
def inbox_promote(item_id, customer, as_json):
    """Promote an inbox item to a task."""
    backend = get_backend()
    result = backend.inbox.promote_to_task(
        item_id=item_id,
        tasks=backend.tasks,
        customer=customer,
    )
    if as_json:
        click.echo(json.dumps(result, default=str))
    else:
        click.echo(f"Promoted to task: {result.get('title')}")


@inbox.command("edit")
def inbox_edit():
    """Open the inbox file in $EDITOR."""
    f = get_backend().inbox.data_file
    if f is None:
        click.echo("This backend has no editable file.", err=True)
        sys.exit(1)
    open_in_editor(f)
