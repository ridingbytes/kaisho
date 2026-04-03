from datetime import datetime

import click

from ..config import get_config, load_settings_yaml
from ..services import clocks as clock_svc
from ..services import customers as customer_svc
from ..services import inbox as inbox_svc
from ..services import kanban
from ..services.settings import get_state_names
from .inbox import _clean_title as clean_inbox_title
from .task import CUSTOMER_STRIP_RE


def _get_keywords() -> set[str]:
    """Get task keywords from settings."""
    settings = load_settings_yaml()
    names = get_state_names(settings)
    return set(names) if names else {
        "TODO", "NEXT", "IN-PROGRESS", "WAIT", "DONE", "CANCELLED"
    }


def _print_section(title: str) -> None:
    click.echo(f"\n--- {title} ---")


def _print_active_timer(cfg) -> None:
    """Print active timer section."""
    _print_section("Aktiver Timer")
    timer = clock_svc.get_active_timer(clocks_file=cfg.CLOCKS_FILE)
    if timer is None:
        click.echo("  (keiner)")
    else:
        customer = timer.get("customer", "")
        desc = timer.get("description", "")
        start = (timer.get("start") or "")[:16].replace("T", " ")
        click.echo(f"  {customer}: {desc} (seit {start})")


def _print_open_tasks(cfg, keywords: set[str]) -> None:
    """Print open tasks section."""
    tasks = kanban.list_tasks(
        todos_file=cfg.TODOS_FILE,
        keywords=keywords,
        include_done=False,
    )
    _print_section(f"Offene Tasks ({len(tasks)})")
    for t in tasks[:10]:
        status = (t.get("status") or "").ljust(12)
        customer = t.get("customer") or "-"
        customer_str = f"[{customer}]"
        title = CUSTOMER_STRIP_RE.sub("", t.get("title") or "")
        click.echo(f"  {status} {customer_str}  {title}")
    if len(tasks) > 10:
        click.echo(f"  ... and {len(tasks) - 10} more")


def _print_inbox(cfg) -> None:
    """Print inbox section."""
    items = inbox_svc.list_items(inbox_file=cfg.INBOX_FILE)
    _print_section(f"Inbox ({len(items)} unbearbeitet)")
    for item in items[:5]:
        item_type = (item.get("type") or "NOTIZ").ljust(6)
        customer = item.get("customer") or "-"
        customer_str = f"[{customer}]".ljust(12)
        title = clean_inbox_title(item.get("title") or "")
        click.echo(f"  {item_type} {customer_str}  {title}")
    if len(items) > 5:
        click.echo(f"  ... and {len(items) - 5} more")


def _print_budget_status(cfg) -> None:
    """Print budget status section."""
    _print_section("Budget-Stand")
    summary = customer_svc.get_budget_summary(kunden_file=cfg.KUNDEN_FILE)
    for s in summary:
        name = s["name"].ljust(20)
        rest = s.get("rest", 0)
        kontingent = s.get("kontingent", 0)
        percent = s.get("percent", 0)
        if kontingent > 0:
            warning = "  (!)" if percent < 10 else ""
            click.echo(
                f"  {name} {rest:.0f}h rest"
                f" ({percent}%){warning}"
            )
        else:
            click.echo(f"  {name} (kein Kontingent)")


@click.command("briefing")
def briefing():
    """Morning overview: timer, tasks, inbox, budgets."""
    cfg = get_config()
    keywords = _get_keywords()

    now = datetime.now()
    day_names = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
    day = day_names[now.weekday()]
    date_str = now.strftime("%Y-%m-%d")

    click.echo(f"=== OmniControl Briefing ({date_str}, {day}) ===")

    _print_active_timer(cfg)
    _print_open_tasks(cfg, keywords)
    _print_inbox(cfg)
    _print_budget_status(cfg)
    click.echo("")
