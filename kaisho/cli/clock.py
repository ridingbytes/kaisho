import json
import sys
from datetime import date

import click

from ..backends import get_backend
from . import open_in_editor


def _format_entry(entry: dict) -> str:
    """Format a clock entry for display."""
    start = (entry.get("start") or "")[:10]
    customer = (entry.get("customer") or "").ljust(10)
    minutes = entry.get("duration_minutes") or 0
    hours = minutes // 60
    mins = minutes % 60
    duration = f"{hours}:{mins:02d}".ljust(6)
    desc = entry.get("description") or ""
    return f"{start}  {customer}  {duration}  {desc}"


@click.group()
def clock():
    """Manage time tracking."""


@clock.command("book")
@click.argument("duration")
@click.argument("customer_name")
@click.argument("description", nargs=-1, required=False)
@click.option("--json", "as_json", is_flag=True)
def clock_book(duration, customer_name, description, as_json):
    """Book time retroactively (e.g. 2h, 30min)."""
    result = get_backend().clocks.quick_book(
        duration_str=duration,
        customer=customer_name,
        description=" ".join(description),
    )
    if as_json:
        click.echo(json.dumps(result, default=str))
    else:
        click.echo(f"Booked: {_format_entry(result)}")


@clock.command("start")
@click.argument("customer_name")
@click.argument("description", nargs=-1, required=False)
@click.option("--json", "as_json", is_flag=True)
def clock_start(customer_name, description, as_json):
    """Start a timer."""
    desc = " ".join(description)
    result = get_backend().clocks.start(
        customer=customer_name,
        description=desc,
    )
    if as_json:
        click.echo(json.dumps(result, default=str))
    else:
        click.echo(f"Timer started: {customer_name} - {desc}")


@clock.command("stop")
@click.option("--desc", default=None,
              help="Set description before stopping")
@click.option("--notes", default=None,
              help="Set notes before stopping")
@click.option("--customer", default=None,
              help="Change customer before stopping")
@click.option("--json", "as_json", is_flag=True)
def clock_stop(desc, notes, customer, as_json):
    """Stop the active timer.

    Optionally set description, notes, or customer
    before stopping.
    """
    backend = get_backend()
    # Apply updates before stopping
    if desc or notes or customer:
        timer = backend.clocks.get_active()
        if timer and timer.get("start"):
            updates = {}
            if desc is not None:
                updates["description"] = desc
            if notes is not None:
                updates["notes"] = notes
            if customer is not None:
                updates["customer"] = customer
            backend.clocks.update_entry(
                start_iso=timer["start"],
                **updates,
            )
    result = backend.clocks.stop()
    if as_json:
        click.echo(json.dumps(result, default=str))
    else:
        click.echo(
            f"Timer stopped: {_format_entry(result)}",
        )


@clock.command("desc")
@click.argument("description", nargs=-1, required=True)
@click.option("--json", "as_json", is_flag=True)
def clock_desc(description, as_json):
    """Set the description on the running timer."""
    backend = get_backend()
    timer = backend.clocks.get_active()
    if timer is None:
        click.echo("No active timer.", err=True)
        sys.exit(1)
    desc = " ".join(description)
    result = backend.clocks.update_entry(
        start_iso=timer["start"],
        description=desc,
    )
    if result is None:
        click.echo("Entry not found.", err=True)
        sys.exit(1)
    if as_json:
        click.echo(json.dumps(result, default=str))
    else:
        click.echo(f"Description set: {desc}")


@clock.command("note")
@click.argument("text", nargs=-1, required=True)
@click.option("--json", "as_json", is_flag=True)
def clock_note(text, as_json):
    """Add notes to the running timer."""
    backend = get_backend()
    timer = backend.clocks.get_active()
    if timer is None:
        click.echo("No active timer.", err=True)
        sys.exit(1)
    existing = timer.get("notes", "") or ""
    new_note = " ".join(text)
    combined = (
        f"{existing}\n{new_note}".strip()
        if existing
        else new_note
    )
    result = backend.clocks.update_entry(
        start_iso=timer["start"],
        notes=combined,
    )
    if result is None:
        click.echo("Entry not found.", err=True)
        sys.exit(1)
    if as_json:
        click.echo(json.dumps(result, default=str))
    else:
        click.echo(f"Note added: {new_note}")


@clock.command("status")
@click.option("--json", "as_json", is_flag=True)
def clock_status(as_json):
    """Show the active timer if any."""
    timer = get_backend().clocks.get_active()
    if as_json:
        click.echo(json.dumps(timer, default=str))
        return
    if timer is None:
        click.echo("No active timer.")
    else:
        click.echo(f"Active timer: {_format_entry(timer)}")


@clock.command("list")
@click.option("--week", "period", flag_value="week",
              help="This week")
@click.option("--month", "period", flag_value="month",
              help="This month")
@click.option("--customer", default=None, help="Filter by customer")
@click.option("--from", "from_date", default=None,
              help="From date (YYYY-MM-DD)")
@click.option("--to", "to_date", default=None,
              help="To date (YYYY-MM-DD)")
@click.option("--json", "as_json", is_flag=True)
def clock_list(period, customer, from_date, to_date, as_json):
    """List clock entries."""
    from_d = date.fromisoformat(from_date) if from_date else None
    to_d = date.fromisoformat(to_date) if to_date else None
    effective_period = period or "today"

    entries = get_backend().clocks.list_entries(
        period=effective_period,
        customer=customer,
        from_date=from_d,
        to_date=to_d,
    )
    if as_json:
        click.echo(json.dumps(entries, default=str))
        return
    if not entries:
        click.echo("No entries found.")
        return
    for entry in entries:
        click.echo(_format_entry(entry))


@clock.command("summary")
@click.option("--week", "period", flag_value="week",
              help="This week instead of this month")
@click.option("--json", "as_json", is_flag=True)
def clock_summary(period, as_json):
    """Show hours per customer."""
    effective_period = period or "month"
    summary = get_backend().clocks.get_summary(period=effective_period)
    if as_json:
        click.echo(json.dumps(summary, default=str))
        return
    if not summary:
        click.echo("No entries found.")
        return
    total_hours = sum(s["hours"] for s in summary)
    click.echo(f"{'Kunde':<15} {'Stunden':>8}")
    click.echo("-" * 25)
    for s in summary:
        click.echo(f"{s['customer']:<15} {s['hours']:>8.1f}h")
    click.echo("-" * 25)
    click.echo(f"{'Gesamt':<15} {total_hours:>8.1f}h")


@clock.command("update")
@click.argument("start_iso")
@click.option("--customer", default=None, help="New customer name")
@click.option("--description", default=None, help="New description")
@click.option("--hours", type=float, default=None,
              help="New duration in hours")
@click.option("--date", "new_date", default=None,
              help="New date (YYYY-MM-DD)")
@click.option("--task-id", default=None,
              help="New task ID (empty to remove)")
@click.option("--invoiced/--no-invoiced", default=None,
              help="Mark as invoiced or not")
@click.option("--notes", default=None, help="New notes")
@click.option("--contract", default=None,
              help="Assign to a contract (empty string to remove)")
@click.option("--json", "as_json", is_flag=True)
def clock_update(
    start_iso, customer, description, hours, new_date,
    task_id, invoiced, notes, contract, as_json,
):
    """Update a clock entry by its start timestamp."""
    from_date = date.fromisoformat(new_date) if new_date else None
    entry = get_backend().clocks.update_entry(
        start_iso=start_iso,
        customer=customer,
        description=description,
        hours=hours,
        new_date=from_date,
        task_id=task_id,
        invoiced=invoiced,
        notes=notes,
        contract=contract,
    )
    if entry is None:
        click.echo("Entry not found.", err=True)
        sys.exit(1)
    if as_json:
        click.echo(json.dumps(entry, default=str))
    else:
        click.echo(f"Updated: {_format_entry(entry)}")


@clock.command("batch-invoice")
@click.argument("customer")
@click.option("--contract", default=None,
              help="Filter by contract name")
@click.option("--json", "as_json", is_flag=True)
def clock_batch_invoice(customer, contract, as_json):
    """Mark all uninvoiced entries for a customer."""
    entries = get_backend().clocks.list_entries(
        period="year",
        customer=customer,
        contract=contract,
    )
    count = 0
    for e in entries:
        if e.get("invoiced"):
            continue
        get_backend().clocks.update_entry(
            start_iso=e["start"], invoiced=True,
        )
        count += 1
    if as_json:
        click.echo(json.dumps({"invoiced": count}))
    else:
        click.echo(f"Marked {count} entries as invoiced.")


@clock.command("edit")
def clock_edit():
    """Open the clocks file in $EDITOR."""
    f = get_backend().clocks.data_file
    if f is None:
        click.echo("This backend has no editable file.", err=True)
        sys.exit(1)
    open_in_editor(f)
