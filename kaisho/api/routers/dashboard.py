from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter

from ...backends import get_backend

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/")
def get_dashboard():
    backend = get_backend()
    active_timer = backend.clocks.get_active()
    open_tasks = backend.tasks.list_tasks(
        include_done=False,
    )
    inbox_items = backend.inbox.list_items()
    budgets = backend.customers.get_budget_summary()

    # Hours this month
    all_entries = backend.clocks.list_entries(
        period="year",
    )
    month_entries = backend.clocks.list_entries(
        period="month",
    )
    month_minutes = sum(
        e.get("duration_minutes") or 0
        for e in month_entries
    )

    # Budgets nearing exhaustion (>= 80%)
    budgets_warning = [
        b for b in budgets
        if b.get("budget", 0) > 0
        and b.get("used", 0) / b["budget"] >= 0.8
    ]

    # Unassigned cloud entries
    unassigned_count = sum(
        1 for e in all_entries
        if not e.get("customer")
    )

    # Aging inbox (> 7 days old)
    aging_inbox = 0
    for item in inbox_items:
        props = item.get("properties", {})
        created = props.get("CREATED", "")
        if not created:
            continue
        try:
            created_date = date.fromisoformat(
                created[:10],
            )
            if (date.today() - created_date).days > 7:
                aging_inbox += 1
        except ValueError:
            continue

    return {
        "active_timer": active_timer,
        "open_task_count": len(open_tasks),
        "inbox_count": len(inbox_items),
        "budgets": budgets,
        "month_hours": round(
            month_minutes / 60, 1,
        ),
        "budgets_warning": len(budgets_warning),
        "unassigned_cloud": unassigned_count,
        "aging_inbox": aging_inbox,
    }


def _period_range(period: str) -> tuple[date, date]:
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


def _billable_contracts(backend) -> set[tuple[str, str]]:
    """Return set of (customer, contract_name) that are
    billable. A contract is billable unless explicitly
    marked otherwise."""
    result = set()
    customers = backend.customers.list_customers(
        include_inactive=True,
    )
    for c in customers:
        for con in c.get("contracts", []):
            if con.get("billable", True):
                result.add((c["name"], con["name"]))
    return result


def _is_billable(
    entry: dict,
    billable_set: set[tuple[str, str]],
) -> bool:
    """An entry is billable if it has a contract and that
    contract is in the billable set."""
    contract = entry.get("contract")
    if not contract:
        return False
    return (entry.get("customer", ""), contract) in billable_set


@router.get("/time-insights")
def get_time_insights(period: str = "month"):
    backend = get_backend()
    start, end = _period_range(period)

    entries = backend.clocks.list_entries(
        period="all",
        from_date=start,
        to_date=end,
    )

    billable_set = _billable_contracts(backend)

    # Daily aggregation
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
        if _is_billable(e, billable_set):
            daily_map[d]["billable_min"] += mins

    # By customer aggregation
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
        is_bill = _is_billable(e, billable_set)
        cust_map[cust]["total_min"] += mins
        if is_bill:
            cust_map[cust]["billable_min"] += mins
            billable_total += mins
        else:
            non_billable_total += mins
        cust_map[cust]["entries"].append({
            "start": e.get("start"),
            "customer": cust,
            "description": e.get("description", ""),
            "contract": e.get("contract"),
            "task_id": e.get("task_id"),
            "duration_minutes": mins,
            "billable": is_bill,
        })

    by_customer = sorted(
        [
            {"name": k, **v}
            for k, v in cust_map.items()
        ],
        key=lambda x: x["total_min"],
        reverse=True,
    )

    daily = sorted(
        daily_map.values(), key=lambda x: x["date"],
    )

    return {
        "period": period,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "daily": daily,
        "by_customer": by_customer,
        "billable_total_min": billable_total,
        "non_billable_total_min": non_billable_total,
        "total_min": billable_total + non_billable_total,
    }
