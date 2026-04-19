import json
import sys
from datetime import date

import click

from ..backends import get_backend


def _format_contract(contract: dict) -> str:
    name = contract["name"].ljust(20)
    budget = contract["budget"]
    used = contract.get("used", 0.0)
    start = contract.get("start_date", "")
    end = contract.get("end_date") or "active"
    if budget > 0:
        pct = round((used / budget) * 100)
        return (
            f"{name}  {used:>6.1f}h / {budget:>6.0f}h"
            f"  ({pct}%)  {start} -> {end}"
        )
    return f"{name}  {start} -> {end}"


@click.group("contract")
def contract_cmd():
    """Manage customer contracts."""


@contract_cmd.command("list")
@click.argument("customer")
@click.option("--json", "as_json", is_flag=True)
def contract_list(customer, as_json):
    """List contracts for a customer."""
    try:
        contracts = get_backend().customers.list_contracts(customer)
    except ValueError as e:
        click.echo(str(e), err=True)
        sys.exit(1)
    if as_json:
        click.echo(json.dumps(contracts, default=str))
        return
    if not contracts:
        click.echo("No contracts found.")
        return
    for c in contracts:
        click.echo(_format_contract(c))


@contract_cmd.command("add")
@click.argument("customer")
@click.argument("name")
@click.option("--hours", "-h", required=True, type=float,
              help="Budget in hours")
@click.option("--start", default=None,
              help="Start date (YYYY-MM-DD, default today)")
@click.option("--notes", default="", help="Optional notes")
def contract_add(customer, name, hours, start, notes):
    """Add a contract to a customer."""
    start_date = start or date.today().isoformat()
    try:
        contract = get_backend().customers.add_contract(
            customer, name, hours, start_date, notes
        )
    except ValueError as e:
        click.echo(str(e), err=True)
        sys.exit(1)
    click.echo(
        f"Added contract '{contract['name']}' to {customer} "
        f"({contract['budget']:.0f}h, from {contract['start_date']})"
    )


@contract_cmd.command("close")
@click.argument("customer")
@click.argument("name")
@click.option("--date", "end_date", default=None,
              help="End date (YYYY-MM-DD, default today)")
def contract_close(customer, name, end_date):
    """Close a contract by setting its end date."""
    end_date = end_date or date.today().isoformat()
    contract = get_backend().customers.close_contract(
        customer, name, end_date
    )
    if contract is None:
        click.echo("Contract not found.", err=True)
        sys.exit(1)
    click.echo(f"Closed '{name}' on {end_date}.")


@contract_cmd.command("edit")
@click.argument("customer")
@click.argument("name")
@click.option("--rename", default=None, help="New name")
@click.option("--hours", type=float, default=None,
              help="New budget in hours")
@click.option("--start", default=None, help="New start date")
@click.option("--end", default=None,
              help="New end date (empty string to reopen)")
@click.option("--notes", default=None, help="New notes")
def contract_edit(customer, name, rename, hours, start, end, notes):
    """Edit a contract's fields."""
    updates: dict = {}
    if rename is not None:
        updates["name"] = rename
    if hours is not None:
        updates["budget"] = hours
    if start is not None:
        updates["start_date"] = start
    if end is not None:
        updates["end_date"] = end or None
    if notes is not None:
        updates["notes"] = notes
    if not updates:
        click.echo("Nothing to update.", err=True)
        sys.exit(1)
    contract = get_backend().customers.update_contract(
        customer, name, updates
    )
    if contract is None:
        click.echo("Contract not found.", err=True)
        sys.exit(1)
    click.echo(f"Updated '{contract['name']}'.")


@contract_cmd.command("delete")
@click.argument("customer")
@click.argument("name")
@click.confirmation_option(
    prompt="Delete this contract? This cannot be undone."
)
def contract_delete(customer, name):
    """Delete a contract."""
    ok = get_backend().customers.delete_contract(customer, name)
    if not ok:
        click.echo("Contract not found.", err=True)
        sys.exit(1)
    click.echo("Deleted.")


@contract_cmd.command("show")
@click.argument("customer")
@click.argument("name")
@click.option("--json", "as_json", is_flag=True)
def contract_show(customer, name, as_json):
    """Show a contract with computed hours."""
    try:
        contracts = get_backend().customers.list_contracts(customer)
    except ValueError as e:
        click.echo(str(e), err=True)
        sys.exit(1)
    name_lower = name.lower()
    contract = next(
        (c for c in contracts if c["name"].lower() == name_lower),
        None,
    )
    if contract is None:
        click.echo("Contract not found.", err=True)
        sys.exit(1)
    if as_json:
        click.echo(json.dumps(contract, default=str))
        return
    status = "CLOSED" if contract["end_date"] else "ACTIVE"
    click.echo(f"Name:       {contract['name']}  [{status}]")
    click.echo(f"Customer:   {contract['customer']}")
    click.echo(f"Budget:     {contract['budget']:.0f}h")
    click.echo(f"Used:       {contract['used']:.1f}h")
    click.echo(f"Rest:       {contract['rest']:.1f}h")
    click.echo(f"Start:      {contract['start_date']}")
    if contract["end_date"]:
        click.echo(f"End:        {contract['end_date']}")
    if contract["notes"]:
        click.echo(f"Notes:      {contract['notes']}")
