"""Cron context builder.

Pre-fetches the user's local Kaisho data and renders it as
a markdown block that can be prepended to a cron prompt.
This mirrors the advisor pattern (see services/advisor.py:
build_context_prompt) so cron prompts can be written
declaratively against fresh data without relying on the
model's tool-calling ability.

The resulting block is included verbatim before the cron
prompt body, so models that cannot tool-call (e.g. Gemma
free-tier) still produce sensible briefings, and models
that can tool-call still see the same baseline data.
"""
from datetime import datetime, timezone

from ..services.advisor import (
    _format_budgets,
    _format_clocks,
    _format_inbox,
    _format_tasks,
)


def _format_time_insights(label: str, data: dict) -> str:
    """Render the dict returned by services.time_insights as
    a short markdown block."""
    if not data:
        return f"  (no {label} data)\n"
    lines = []
    bill = data.get("billable_hours", 0)
    non_bill = data.get("non_billable_hours", 0)
    total = bill + non_bill
    pct = (
        round(100 * bill / total) if total else 0
    )
    lines.append(
        f"  {label}: {total:.1f}h total "
        f"({bill:.1f}h billable, {pct}% billable rate)"
    )
    by_cust = data.get("by_customer", []) or []
    if by_cust:
        lines.append("  By customer:")
        for c in by_cust[:6]:
            name = c.get("customer", "?")
            hours = c.get("hours", 0)
            lines.append(f"    - {name}: {hours:.1f}h")
        if len(by_cust) > 6:
            lines.append(
                f"    - ... and {len(by_cust) - 6} more"
            )
    return "\n".join(lines) + "\n"


def _collect_time_insights(period: str) -> dict:
    """Fetch time-insights for a period (week/month/etc)."""
    from ..backends import get_backend
    from ..services.time_insights import (
        billable_contracts, is_billable, period_range,
    )
    backend = get_backend()
    start, end = period_range(period)
    entries = backend.clocks.list_entries(
        period="all", from_date=start, to_date=end,
    )
    billable_set = billable_contracts(backend)
    bill_min = 0
    non_bill_min = 0
    by_cust: dict[str, float] = {}
    for e in entries:
        mins = e.get("duration_minutes") or 0
        cust = e.get("customer") or "Unknown"
        is_bill = is_billable(e, billable_set)
        if is_bill:
            bill_min += mins
        else:
            non_bill_min += mins
        by_cust[cust] = by_cust.get(cust, 0) + mins
    sorted_cust = sorted(
        by_cust.items(), key=lambda kv: kv[1], reverse=True,
    )
    return {
        "billable_hours": bill_min / 60,
        "non_billable_hours": non_bill_min / 60,
        "by_customer": [
            {"customer": c, "hours": m / 60}
            for c, m in sorted_cust
        ],
    }


def build_cron_context() -> str:
    """Build the markdown context block prepended to every
    cron prompt.

    Pulls open tasks, recent clock entries, inbox items,
    customer budgets, and time insights for week/month.
    Errors are caught per-section so a single failing
    backend call doesn't kill the whole context.
    """
    from ..backends import get_backend
    backend = get_backend()
    now = datetime.now(timezone.utc).strftime(
        "%Y-%m-%d %H:%M UTC",
    )

    sections = [f"# Kaisho Context  ({now})\n"]

    sections.append("## Open Tasks")
    tasks = backend.tasks.list_tasks(include_done=False)
    sections.append(_format_tasks(tasks))

    sections.append("## Recent Clock Entries (week)")
    week_entries = backend.clocks.list_entries(
        period="week",
    )
    sections.append(_format_clocks(week_entries))

    sections.append("## Inbox")
    inbox = backend.inbox.list_items()
    sections.append(_format_inbox(inbox))

    sections.append("## Customer Budgets")
    customers = backend.customers.list_customers()
    sections.append(_format_budgets(customers))

    sections.append("## Time Insights")
    week = _collect_time_insights("week")
    month = _collect_time_insights("month")
    sections.append(_format_time_insights("This week", week))
    sections.append(
        _format_time_insights("This month", month),
    )

    return "\n".join(sections)
