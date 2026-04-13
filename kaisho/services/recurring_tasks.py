"""Recurring tasks service.

Checks tasks with a recurrence property and creates
new task instances when the recurrence interval has
elapsed since the last creation.

Recurrence values: "daily", "weekly", "biweekly",
"monthly", "quarterly".

A recurring task is a template. When it fires, a new
task is created with the same customer, title (prefixed
with the date), and tags. The template stays in its
original state.

Tasks track recurrence via properties:
  - RECURRENCE: "weekly" (the interval)
  - LAST_RECURRED: "2026-04-13" (last creation date)
"""
from datetime import date, timedelta

INTERVALS = {
    "daily": timedelta(days=1),
    "weekly": timedelta(days=7),
    "biweekly": timedelta(days=14),
    "monthly": timedelta(days=30),
    "quarterly": timedelta(days=90),
}


def _is_due(last_recurred: str, interval: str) -> bool:
    """Check if a recurring task is due."""
    delta = INTERVALS.get(interval)
    if delta is None:
        return False
    if not last_recurred:
        return True
    try:
        last = date.fromisoformat(last_recurred)
    except ValueError:
        return True
    return date.today() >= last + delta


def process_recurring_tasks(backend) -> int:
    """Check all tasks and create instances for due ones.

    Returns the number of new tasks created.
    """
    tasks = backend.tasks.list_tasks(include_done=False)
    created = 0

    for task in tasks:
        props = task.get("properties", {})
        recurrence = props.get("RECURRENCE", "")
        if not recurrence:
            continue
        last = props.get("LAST_RECURRED", "")
        if not _is_due(last, recurrence):
            continue

        today = date.today()
        title = (
            f"{task['title']} ({today.strftime('%Y-%m-%d')})"
        )

        backend.tasks.add_task(
            customer=task.get("customer", ""),
            title=title,
            status="TODO",
            tags=task.get("tags", []),
        )

        # Update LAST_RECURRED via set_task_property
        # if the backend supports it. Otherwise the
        # next check will re-evaluate based on date.
        if hasattr(backend.tasks, "set_task_property"):
            backend.tasks.set_task_property(
                task["id"], "LAST_RECURRED",
                today.isoformat(),
            )
        created += 1

    return created
