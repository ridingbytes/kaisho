import json
import sys

import click

from ..backends import get_backend
from . import open_in_editor


def _format_customer(customer: dict) -> str:
    """Format a customer for display."""
    name = customer["name"].ljust(15)
    kontingent = customer.get("kontingent", 0)
    rest = customer.get("rest", 0)
    status = customer.get("status", "active")
    if kontingent > 0:
        percent = round((rest / kontingent) * 100)
        return f"{name}  {rest:>6.0f}h / {kontingent:>6.0f}h  ({percent}%)"
    return f"{name}  {status}"


@click.group()
def customer():
    """Manage customers."""


@customer.command("list")
@click.option("--all", "include_all", is_flag=True,
              help="Include inactive customers")
@click.option("--json", "as_json", is_flag=True)
def customer_list(include_all, as_json):
    """List customers."""
    customers = get_backend().customers.list_customers(
        include_inactive=include_all,
    )
    if as_json:
        click.echo(json.dumps(customers, default=str))
        return
    if not customers:
        click.echo("No customers found.")
        return
    for c in customers:
        click.echo(_format_customer(c))


@customer.command("show")
@click.argument("name")
@click.option("--json", "as_json", is_flag=True)
def customer_show(name, as_json):
    """Show details for a customer."""
    c = get_backend().customers.get_customer(name)
    if c is None:
        click.echo(f"Customer not found: {name}", err=True)
        return
    if as_json:
        click.echo(json.dumps(c, default=str))
        return
    click.echo(f"Name:       {c['name']}")
    click.echo(f"Status:     {c['status']}")
    click.echo(f"Kontingent: {c['kontingent']}h")
    click.echo(f"Verbraucht: {c['verbraucht']}h")
    click.echo(f"Rest:       {c['rest']}h")
    if c.get("repo"):
        click.echo(f"Repo:       {c['repo']}")
    if c.get("properties"):
        click.echo("Properties:")
        for key, val in c["properties"].items():
            click.echo(f"  {key}: {val}")


@customer.command("summary")
@click.option("--json", "as_json", is_flag=True)
def customer_summary(as_json):
    """Show budget summary for all customers."""
    summary = get_backend().customers.get_budget_summary()
    if as_json:
        click.echo(json.dumps(summary, default=str))
        return
    if not summary:
        click.echo("No customers found.")
        return
    click.echo(f"{'Kunde':<15} {'Rest':>8} {'Budget':>8} {'%':>5}")
    click.echo("-" * 42)
    for s in summary:
        name = s["name"].ljust(15)
        rest = f"{s['rest']:.0f}h".rjust(8)
        kontingent = f"{s['kontingent']:.0f}h".rjust(8)
        percent = f"{s['percent']}%".rjust(5)
        click.echo(f"{name} {rest} {kontingent} {percent}")


@customer.command("edit")
def customer_edit():
    """Open the customers file in $EDITOR."""
    f = get_backend().customers.data_file
    if f is None:
        click.echo("This backend has no editable file.", err=True)
        sys.exit(1)
    open_in_editor(f)


@customer.command("entries")
@click.argument("name")
@click.option("--json", "as_json", is_flag=True)
def customer_entries(name, as_json):
    """List time entries for a customer."""
    entries = get_backend().customers.list_time_entries(name)
    if as_json:
        click.echo(json.dumps(entries, default=str))
        return
    if not entries:
        click.echo("No entries found.")
        return
    for e in entries:
        click.echo(
            f"{e['date']}  {e['hours']:>5.1f}h  {e['description']}"
        )


@customer.command("entry-add")
@click.argument("name")
@click.option(
    "--description", "-d", required=True, help="Entry description"
)
@click.option(
    "--hours", "-h", required=True, type=float, help="Hours spent"
)
@click.option("--date", default=None, help="Date (YYYY-MM-DD, default today)")
def customer_entry_add(name, description, hours, date):
    """Add a time entry to a customer."""
    try:
        entry = get_backend().customers.add_time_entry(
            name, description, hours, date
        )
    except ValueError as e:
        click.echo(str(e), err=True)
        sys.exit(1)
    click.echo(
        f"Added: {entry['date']}  {entry['hours']:.1f}h  {entry['description']}"
    )


@customer.command("entry-edit")
@click.argument("name")
@click.argument("entry_id")
@click.option("--description", "-d", default=None)
@click.option("--hours", "-h", default=None, type=float)
@click.option("--date", default=None)
def customer_entry_edit(name, entry_id, description, hours, date):
    """Edit a time entry for a customer."""
    entry = get_backend().customers.update_time_entry(
        name, entry_id,
        description=description,
        hours=hours,
        date=date,
    )
    if entry is None:
        click.echo("Entry not found.", err=True)
        sys.exit(1)
    click.echo(
        f"Updated: {entry['date']}  {entry['hours']:.1f}h  {entry['description']}"
    )


@customer.command("entry-delete")
@click.argument("name")
@click.argument("entry_id")
def customer_entry_delete(name, entry_id):
    """Delete a time entry from a customer."""
    ok = get_backend().customers.delete_time_entry(name, entry_id)
    if not ok:
        click.echo("Entry not found.", err=True)
        sys.exit(1)
    click.echo("Entry deleted.")
