"""Recurring task templates.

The scheduler runs this daily at 06:00. Whether a weekly
template produces one task a week or seven is the whole
question, and it turned on a property no backend writes.
"""
from datetime import date, timedelta

import pytest

from kaisho.services.recurring_tasks import (
    process_recurring_tasks,
)


class FakeTasks:
    """Enough of a task backend to run the service.

    Deliberately without ``set_task_property``: no real
    backend has it, which is the defect this covers.
    """

    def __init__(self, rows):
        self.rows = list(rows)
        self.created = []

    def list_tasks(self, include_done=False):
        if include_done:
            return list(self.rows)
        return [
            r for r in self.rows
            if r.get("status") != "DONE"
        ]

    def add_task(self, **kwargs):
        self.created.append(kwargs)
        self.rows.append({
            "id": f"gen-{len(self.created)}",
            "status": kwargs.get("status", "TODO"),
            "title": kwargs["title"],
            "customer": kwargs.get("customer", ""),
            "tags": kwargs.get("tags", []),
            "properties": {},
        })


class FakeBackend:
    def __init__(self, rows):
        self.tasks = FakeTasks(rows)


def _template(recurrence="weekly", **over):
    row = {
        "id": "T-1",
        "title": "Wochenbericht",
        "customer": "Acme",
        "tags": ["report"],
        "status": "TODO",
        "properties": {"RECURRENCE": recurrence},
    }
    row.update(over)
    return row


def test_a_weekly_template_fires_once_a_week():
    """Run it every day for three weeks.

    Against the old code this produced 21 tasks: nothing
    wrote LAST_RECURRED, so every pass looked like the
    first one.
    """
    backend = FakeBackend([_template("weekly")])
    start = date(2026, 1, 1)
    for offset in range(21):
        process_recurring_tasks(
            backend, today=start + timedelta(days=offset),
        )
    assert len(backend.tasks.created) == 3
    assert [c["title"] for c in backend.tasks.created] == [
        "Wochenbericht (2026-01-01)",
        "Wochenbericht (2026-01-08)",
        "Wochenbericht (2026-01-15)",
    ]


def test_a_daily_template_fires_daily():
    backend = FakeBackend([_template("daily")])
    start = date(2026, 1, 1)
    for offset in range(5):
        process_recurring_tasks(
            backend, today=start + timedelta(days=offset),
        )
    assert len(backend.tasks.created) == 5


@pytest.mark.parametrize(
    "recurrence,days,expected",
    [
        ("biweekly", 30, 3),  # Tage 0, 14, 28
        ("monthly", 90, 3),   # Tage 0, 30, 60
        ("quarterly", 200, 3),  # Tage 0, 90, 180
    ],
)
def test_longer_intervals(recurrence, days, expected):
    backend = FakeBackend([_template(recurrence)])
    start = date(2026, 1, 1)
    for offset in range(days):
        process_recurring_tasks(
            backend, today=start + timedelta(days=offset),
        )
    assert len(backend.tasks.created) == expected


def test_a_completed_instance_still_counts():
    """Finishing this week's report must not make next
    morning look like a fresh start."""
    backend = FakeBackend([_template("weekly")])
    day = date(2026, 1, 1)
    process_recurring_tasks(backend, today=day)
    for row in backend.tasks.rows:
        if row["id"].startswith("gen-"):
            row["status"] = "DONE"

    process_recurring_tasks(
        backend, today=day + timedelta(days=1),
    )
    assert len(backend.tasks.created) == 1


def test_templates_sharing_a_title_stay_separate():
    """Two customers, one report name. Acme's instance must
    not satisfy Globex's template."""
    backend = FakeBackend([
        _template("weekly", id="T-1", customer="Acme"),
        _template("weekly", id="T-2", customer="Globex"),
    ])
    process_recurring_tasks(backend, today=date(2026, 1, 1))
    assert len(backend.tasks.created) == 2
    assert {c["customer"] for c in backend.tasks.created} == {
        "Acme", "Globex",
    }


def test_a_recorded_property_is_honoured():
    """If something did write LAST_RECURRED, it counts."""
    backend = FakeBackend([
        _template("weekly", properties={
            "RECURRENCE": "weekly",
            "LAST_RECURRED": "2026-01-05",
        }),
    ])
    process_recurring_tasks(backend, today=date(2026, 1, 8))
    assert backend.tasks.created == []
    process_recurring_tasks(backend, today=date(2026, 1, 12))
    assert len(backend.tasks.created) == 1


def test_no_recurrence_property_means_nothing_happens():
    backend = FakeBackend([
        {"id": "T-9", "title": "Normal", "customer": "",
         "tags": [], "status": "TODO", "properties": {}},
    ])
    process_recurring_tasks(backend, today=date(2026, 1, 1))
    assert backend.tasks.created == []


def test_an_unknown_interval_is_ignored():
    backend = FakeBackend([_template("fortnightly")])
    process_recurring_tasks(backend, today=date(2026, 1, 1))
    assert backend.tasks.created == []
