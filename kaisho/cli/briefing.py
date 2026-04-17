from datetime import datetime

import click

from ..backends import get_backend
from .inbox import _clean_title as clean_inbox_title
from .task import CUSTOMER_STRIP_RE


def _print_section(title: str) -> None:
    click.echo(f"\n--- {title} ---")


def _print_active_timer(backend) -> None:
    """Print active timer section."""
    _print_section("Active Timer")
    timer = backend.clocks.get_active()
    if timer is None:
        click.echo("  (none)")
    else:
        customer = timer.get("customer", "")
        desc = timer.get("description", "")
        start = (
            timer.get("start") or ""
        )[:16].replace("T", " ")
        click.echo(
            f"  {customer}: {desc} (since {start})"
        )


def _print_open_tasks(backend) -> None:
    """Print open tasks section."""
    tasks = backend.tasks.list_tasks(
        include_done=False,
    )
    _print_section(f"Open Tasks ({len(tasks)})")
    for t in tasks[:10]:
        status = (t.get("status") or "").ljust(12)
        customer = t.get("customer") or "-"
        customer_str = f"[{customer}]"
        title = CUSTOMER_STRIP_RE.sub(
            "", t.get("title") or "",
        )
        click.echo(
            f"  {status} {customer_str}  {title}"
        )
    if len(tasks) > 10:
        click.echo(
            f"  ... and {len(tasks) - 10} more"
        )


def _print_inbox(backend) -> None:
    """Print inbox section."""
    items = backend.inbox.list_items()
    _print_section(
        f"Inbox ({len(items)} pending)"
    )
    for item in items[:5]:
        item_type = (
            item.get("type") or "NOTE"
        ).ljust(6)
        customer = item.get("customer") or "-"
        customer_str = f"[{customer}]".ljust(12)
        title = clean_inbox_title(
            item.get("title") or "",
        )
        click.echo(
            f"  {item_type} {customer_str}"
            f"  {title}"
        )
    if len(items) > 5:
        click.echo(
            f"  ... and {len(items) - 5} more"
        )


def _print_budget_status(backend) -> None:
    """Print budget status section."""
    _print_section("Budget Status")
    summary = backend.customers.get_budget_summary()
    for s in summary:
        name = s["name"].ljust(20)
        remaining = s.get("rest", 0)
        budget = s.get("budget", 0)
        percent = s.get("percent", 0)
        if budget > 0:
            warning = "  (!)" if percent < 10 else ""
            click.echo(
                f"  {name} {remaining:.0f}h"
                f" remaining ({percent}%){warning}"
            )
        else:
            click.echo(
                f"  {name} (no budget defined)"
            )


@click.command("briefing")
def briefing():
    """Morning overview: timer, tasks, inbox, budgets."""
    backend = get_backend()

    now = datetime.now()
    day = now.strftime("%a")
    date_str = now.strftime("%Y-%m-%d")

    click.echo(
        f"=== Kaisho Briefing ({date_str}, {day}) ==="
    )

    _print_active_timer(backend)
    _print_open_tasks(backend)
    _print_inbox(backend)
    _print_budget_status(backend)
    click.echo("")
