"""Dashboard aggregation.

Pulled out of the dashboard router so the router stays a
thin request/response shim and the metric logic is unit-
testable without HTTP.
"""
from collections import defaultdict
from datetime import date

from .time_insights import (
    billable_contracts,
    is_billable,
    period_range,
)


def count_budgets_warning(budgets: list[dict]) -> int:
    """Count budgets at >= 80% usage."""
    return sum(
        1 for b in budgets
        if b.get("budget", 0) > 0
        and b.get("used", 0) / b["budget"] >= 0.8
    )


def is_aging_item(item: dict) -> bool:
    """Check if an inbox item is older than 7 days."""
    created = (
        item.get("properties", {}).get("CREATED", "")
    )
    if not created:
        return False
    try:
        created_date = date.fromisoformat(created[:10])
    except ValueError:
        return False
    return (date.today() - created_date).days > 7


def build_summary(backend) -> dict:
    """Assemble the dashboard summary metrics."""
    inbox_items = backend.inbox.list_items()
    budgets = backend.customers.get_budget_summary()

    month_minutes = sum(
        e.get("duration_minutes") or 0
        for e in backend.clocks.list_entries(period="month")
    )
    unassigned_count = sum(
        1 for e in backend.clocks.list_entries(period="year")
        if not e.get("customer")
    )

    return {
        "active_timer": backend.clocks.get_active(),
        "open_task_count": len(
            backend.tasks.list_tasks(include_done=False),
        ),
        "inbox_count": len(inbox_items),
        "budgets": budgets,
        "month_hours": round(month_minutes / 60, 1),
        "budgets_warning": count_budgets_warning(budgets),
        "unassigned_cloud": unassigned_count,
        "aging_inbox": sum(
            1 for i in inbox_items if is_aging_item(i)
        ),
    }


def _aggregate_daily(
    entries: list[dict],
    billable_set: set[tuple[str, str]],
) -> list[dict]:
    """Aggregate clock entries into per-day totals."""
    daily_map: dict[str, dict] = {}
    for e in entries:
        d = (e.get("start") or "")[:10]
        if not d:
            continue
        if d not in daily_map:
            daily_map[d] = {
                "date": d,
                "total_min": 0,
                "billable_min": 0,
            }
        mins = e.get("duration_minutes") or 0
        daily_map[d]["total_min"] += mins
        if is_billable(e, billable_set):
            daily_map[d]["billable_min"] += mins
    return sorted(
        daily_map.values(), key=lambda x: x["date"],
    )


def _entry_summary(entry: dict, billable: bool) -> dict:
    """Build a summary dict for a single clock entry."""
    return {
        "start": entry.get("start"),
        "customer": entry.get("customer", "Unknown"),
        "description": entry.get("description", ""),
        "contract": entry.get("contract"),
        "task_id": entry.get("task_id"),
        "duration_minutes": (
            entry.get("duration_minutes") or 0
        ),
        "billable": billable,
    }


def _aggregate_by_customer(
    entries: list[dict],
    billable_set: set[tuple[str, str]],
) -> tuple[list[dict], int, int]:
    """Aggregate clock entries by customer.

    Returns ``(by_customer, billable_total,
    non_billable_total)``.
    """
    cust_map: dict[str, dict] = defaultdict(
        lambda: {
            "total_min": 0,
            "billable_min": 0,
            "entries": [],
        },
    )
    billable_total = 0
    non_billable_total = 0
    for e in entries:
        cust = e.get("customer", "Unknown")
        mins = e.get("duration_minutes") or 0
        is_bill = is_billable(e, billable_set)
        cust_map[cust]["total_min"] += mins
        if is_bill:
            cust_map[cust]["billable_min"] += mins
            billable_total += mins
        else:
            non_billable_total += mins
        cust_map[cust]["entries"].append(
            _entry_summary(e, is_bill),
        )
    by_customer = sorted(
        [{"name": k, **v} for k, v in cust_map.items()],
        key=lambda x: x["total_min"],
        reverse=True,
    )
    return by_customer, billable_total, non_billable_total


def build_time_insights(backend, period: str) -> dict:
    """Assemble the time-insights payload for a period."""
    start, end = period_range(period)
    entries = backend.clocks.list_entries(
        period="all", from_date=start, to_date=end,
    )
    billable_set = billable_contracts(backend)
    daily = _aggregate_daily(entries, billable_set)
    by_customer, bill, non_bill = _aggregate_by_customer(
        entries, billable_set,
    )
    return {
        "period": period,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "daily": daily,
        "by_customer": by_customer,
        "billable_total_min": bill,
        "non_billable_total_min": non_bill,
        "total_min": bill + non_bill,
    }
