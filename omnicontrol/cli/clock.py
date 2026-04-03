import json
from datetime import date

import click

from ..config import get_config
from ..services import clocks as clock_svc
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
    """Manage time tracking in clocks.org."""


@clock.command("book")
@click.argument("duration")
@click.argument("customer_name")
@click.argument("description")
@click.option("--json", "as_json", is_flag=True)
def clock_book(duration, customer_name, description, as_json):
    """Book time retroactively (e.g. 2h, 30min)."""
    cfg = get_config()
    result = clock_svc.quick_book(
        clocks_file=cfg.CLOCKS_FILE,
        duration_str=duration,
        customer=customer_name,
        description=description,
    )
    if as_json:
        click.echo(json.dumps(result, default=str))
    else:
        click.echo(f"Booked: {_format_entry(result)}")


@clock.command("start")
@click.argument("customer_name")
@click.argument("description")
@click.option("--json", "as_json", is_flag=True)
def clock_start(customer_name, description, as_json):
    """Start a timer."""
    cfg = get_config()
    result = clock_svc.start_timer(
        clocks_file=cfg.CLOCKS_FILE,
        customer=customer_name,
        description=description,
    )
    if as_json:
        click.echo(json.dumps(result, default=str))
    else:
        click.echo(
            f"Timer started: {customer_name} - {description}"
        )


@clock.command("stop")
@click.option("--json", "as_json", is_flag=True)
def clock_stop(as_json):
    """Stop the active timer."""
    cfg = get_config()
    result = clock_svc.stop_timer(clocks_file=cfg.CLOCKS_FILE)
    if as_json:
        click.echo(json.dumps(result, default=str))
    else:
        click.echo(f"Timer stopped: {_format_entry(result)}")


@clock.command("status")
@click.option("--json", "as_json", is_flag=True)
def clock_status(as_json):
    """Show the active timer if any."""
    cfg = get_config()
    timer = clock_svc.get_active_timer(clocks_file=cfg.CLOCKS_FILE)
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
    cfg = get_config()
    from_d = date.fromisoformat(from_date) if from_date else None
    to_d = date.fromisoformat(to_date) if to_date else None
    effective_period = period or "today"

    entries = clock_svc.list_entries(
        clocks_file=cfg.CLOCKS_FILE,
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
    cfg = get_config()
    effective_period = period or "month"
    summary = clock_svc.get_summary(
        clocks_file=cfg.CLOCKS_FILE,
        period=effective_period,
    )
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


@clock.command("edit")
def clock_edit():
    """Open clocks.org in $EDITOR."""
    cfg = get_config()
    open_in_editor(cfg.CLOCKS_FILE)
