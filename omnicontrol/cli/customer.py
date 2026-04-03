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
