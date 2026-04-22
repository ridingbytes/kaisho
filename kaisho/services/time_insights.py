"""Time insight helpers.

Pure functions for calculating billable/non-billable splits,
period date ranges, and per-customer aggregations. Used by
both the dashboard API router and the cron tool dispatcher.
"""
from datetime import date, timedelta


def period_range(period: str) -> tuple[date, date]:
    """Return (start, end) dates for the given period."""
    today = date.today()
    if period == "week":
        start = today - timedelta(days=today.weekday())
        return start, today
    if period == "month":
        return today.replace(day=1), today
    if period == "quarter":
        q_month = ((today.month - 1) // 3) * 3 + 1
        return today.replace(month=q_month, day=1), today
    if period == "year":
        return today.replace(month=1, day=1), today
    return today.replace(month=1, day=1), today


def billable_contracts(backend) -> set[tuple[str, str]]:
    """Return set of (customer, contract_name) that are
    billable.

    A contract is billable unless explicitly marked
    otherwise.
    """
    result = set()
    customers = backend.customers.list_customers(
        include_inactive=True,
    )
    for c in customers:
        for con in c.get("contracts", []):
            if con.get("billable", True):
                result.add((c["name"], con["name"]))
    return result


def is_billable(
    entry: dict,
    billable_set: set[tuple[str, str]],
) -> bool:
    """An entry is billable if it has a contract and that
    contract is in the billable set."""
    contract = entry.get("contract")
    if not contract:
        return False
    return (
        entry.get("customer", ""), contract
    ) in billable_set
