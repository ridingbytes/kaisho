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
import logging
from datetime import datetime, timezone

from ..services.advisor import (
    _format_budgets,
    _format_clocks,
    _format_inbox,
    _format_tasks,
)

log = logging.getLogger(__name__)


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


def _section(heading: str, render) -> list[str]:
    """Render one section, or a note that it is missing.

    The per-section catch this docstring used to promise was
    never written: one raising backend call took the whole
    context with it. The caller catches, so the job still
    ran -- with no tasks, no clocks, no inbox, no budgets
    and no insights, and nothing in the output to say so.
    A briefing built blind reads exactly like a briefing
    built on an empty week.
    """
    try:
        return [heading, render()]
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "cron context: %s unavailable: %s",
            heading.lstrip("# "), exc,
        )
        return [
            heading,
            f"  (unavailable: {exc})\n",
        ]


def build_cron_context() -> str:
    """Build the markdown context block prepended to every
    cron prompt.

    Pulls open tasks, recent clock entries, inbox items,
    customer budgets, and time insights for week/month.
    Errors are caught per section, so one failing backend
    call costs that section and not the rest.
    """
    from ..backends import get_backend
    now = datetime.now(timezone.utc).strftime(
        "%Y-%m-%d %H:%M UTC",
    )

    sections = [f"# Kaisho Context  ({now})\n"]

    def tasks():
        return _format_tasks(
            get_backend().tasks.list_tasks(
                include_done=False,
            )
        )

    def clocks():
        return _format_clocks(
            get_backend().clocks.list_entries(period="week")
        )

    def inbox():
        return _format_inbox(
            get_backend().inbox.list_items()
        )

    def budgets():
        return _format_budgets(
            get_backend().customers.list_customers()
        )

    def insights():
        return (
            _format_time_insights(
                "This week", _collect_time_insights("week"),
            )
            + _format_time_insights(
                "This month",
                _collect_time_insights("month"),
            )
        )

    sections += _section("## Open Tasks", tasks)
    sections += _section(
        "## Recent Clock Entries (week)", clocks,
    )
    sections += _section("## Inbox", inbox)
    sections += _section("## Customer Budgets", budgets)
    sections += _section("## Time Insights", insights)

    return "\n".join(sections)
