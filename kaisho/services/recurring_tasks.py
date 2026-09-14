"""Recurring tasks service.

Checks tasks with a recurrence property and creates new
task instances when the recurrence interval has elapsed
since the last one.

Recurrence values: "daily", "weekly", "biweekly",
"monthly", "quarterly".

A recurring task is a template. When it fires, a new task
is created with the same customer, tags, and the title
suffixed with today's date. The template stays as it is.

The template is marked up with a task property::

    :RECURRENCE: weekly

How "when did this last fire" is answered
-----------------------------------------

By looking for the instances. The obvious place would be a
``LAST_RECURRED`` property written back to the template,
and this module used to do that::

    if hasattr(backend.tasks, "set_task_property"):
        backend.tasks.set_task_property(...)

No backend has ever had that method, so the branch never
ran, ``LAST_RECURRED`` was never written, and the check
``if not last_recurred: return True`` therefore said "due"
on every pass. The scheduler runs this daily at 06:00, so
a weekly template produced seven tasks a week and a
quarterly one produced ninety.

Deriving the date from the instances needs no new backend
method and cannot drift out of step with reality: the
instances are the record. ``LAST_RECURRED`` is still read
when something else has set it, and preferred when it is
more recent.
"""
import re
from datetime import date, timedelta

INTERVALS = {
    "daily": timedelta(days=1),
    "weekly": timedelta(days=7),
    "biweekly": timedelta(days=14),
    # Approximations on purpose: a fixed delta keeps the
    # cadence steady instead of drifting with month length.
    "monthly": timedelta(days=30),
    "quarterly": timedelta(days=90),
}

_DATE = r"(\d{4}-\d{2}-\d{2})"


def _instance_title(title: str, on: date) -> str:
    """The title an instance created on ``on`` carries."""
    return f"{title} ({on.isoformat()})"


def _latest_instance(
    tasks: list[dict], template: dict,
) -> date | None:
    """Newest instance of ``template``, by the date in its
    title.

    Matched on customer as well as title, so two templates
    that happen to share a title for different customers do
    not read each other's instances.
    """
    pattern = re.compile(
        rf"^{re.escape(template['title'])} \({_DATE}\)$"
    )
    customer = template.get("customer", "")
    best: date | None = None
    for task in tasks:
        if task.get("id") == template.get("id"):
            continue
        if task.get("customer", "") != customer:
            continue
        match = pattern.match(task.get("title", ""))
        if not match:
            continue
        try:
            stamp = date.fromisoformat(match.group(1))
        except ValueError:
            continue
        if best is None or stamp > best:
            best = stamp
    return best


def _parse_date(value: str) -> date | None:
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        return None


def _last_fired(
    tasks: list[dict], template: dict,
) -> date | None:
    """When this template last produced a task, or None.

    Whichever of the recorded property and the newest
    instance is later. The property alone would be wrong if
    nothing writes it; the instances alone would be wrong
    if someone deleted them and the property survived.
    """
    recorded = _parse_date(
        template.get("properties", {}).get(
            "LAST_RECURRED", "",
        )
    )
    found = _latest_instance(tasks, template)
    if recorded and found:
        return max(recorded, found)
    return recorded or found


def _is_due(
    last: date | None, interval: str, today: date,
) -> bool:
    """Whether a template with this interval should fire."""
    delta = INTERVALS.get(interval)
    if delta is None:
        return False
    if last is None:
        return True
    return today >= last + delta


def process_recurring_tasks(backend, today=None) -> int:
    """Create instances for every template that is due.

    :param backend: Kaisho backend.
    :param today: Override for the current date; the
        scheduler leaves it alone, tests set it.
    :returns: Number of tasks created.
    """
    today = today or date.today()
    # Instances that have been completed still count as
    # having happened, so the scan has to see them.
    tasks = backend.tasks.list_tasks(include_done=True)
    created = 0

    for template in tasks:
        recurrence = template.get("properties", {}).get(
            "RECURRENCE", "",
        )
        if not recurrence:
            continue
        if not _is_due(
            _last_fired(tasks, template), recurrence, today,
        ):
            continue

        backend.tasks.add_task(
            customer=template.get("customer", ""),
            title=_instance_title(
                template["title"], today,
            ),
            status="TODO",
            tags=template.get("tags", []),
        )
        created += 1

    return created
