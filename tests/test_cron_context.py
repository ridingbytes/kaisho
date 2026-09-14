"""The context block prepended to every cron prompt.

Its docstring promised per-section error handling. The code
had none, so one raising backend call cost the whole block:
the caller in executor.py catches, the job still runs, and
the model writes a briefing with no tasks, no clocks, no
inbox and no budgets in front of it. That reads exactly
like a briefing about an empty week.
"""
import pytest

from kaisho.cron import context as ctx


class _Tasks:
    def list_tasks(self, include_done=False):
        return [{
            "id": "T-1", "title": "Bericht schreiben",
            "status": "TODO", "customer": "Acme",
            "tags": [],
        }]


class _Clocks:
    def list_entries(self, period=None, **kw):
        return [{
            "customer": "Acme", "duration_minutes": 90,
            "description": "Arbeit", "contract": "Wartung",
        }]


class _Inbox:
    def list_items(self):
        return [{
            "id": "I-1", "title": "Rueckruf",
            "type": "CALL", "customer": "Acme",
        }]


class _Customers:
    def list_customers(self):
        return [{"name": "Acme", "contracts": []}]


class _Backend:
    tasks = _Tasks()
    clocks = _Clocks()
    inbox = _Inbox()
    customers = _Customers()


@pytest.fixture
def backend(monkeypatch):
    """Install a working backend everywhere context reaches
    for one."""
    import kaisho.backends as backends
    fake = _Backend()
    monkeypatch.setattr(backends, "get_backend", lambda: fake)
    monkeypatch.setattr(
        ctx, "_collect_time_insights",
        lambda period: {
            "billable_hours": 6.0,
            "non_billable_hours": 2.0,
            "by_customer": [
                {"customer": "Acme", "hours": 6.0},
            ],
        },
    )
    return fake


_HEADINGS = [
    "## Open Tasks",
    "## Recent Clock Entries (week)",
    "## Inbox",
    "## Customer Budgets",
    "## Time Insights",
]


def test_every_section_is_present(backend):
    out = ctx.build_cron_context()
    for heading in _HEADINGS:
        assert heading in out
    assert "Bericht schreiben" in out
    assert "Kaisho Context" in out


@pytest.mark.parametrize(
    "attr,resource",
    [
        ("tasks", "list_tasks"),
        ("clocks", "list_entries"),
        ("inbox", "list_items"),
        ("customers", "list_customers"),
    ],
)
def test_one_failing_section_costs_only_itself(
    backend, monkeypatch, attr, resource,
):
    def boom(*args, **kwargs):
        raise RuntimeError("backend kaputt")

    monkeypatch.setattr(
        type(getattr(backend, attr)), resource, boom,
    )
    out = ctx.build_cron_context()

    # Every heading still there, and the failure is named
    # rather than silently missing.
    for heading in _HEADINGS:
        assert heading in out
    assert "unavailable" in out
    assert "backend kaputt" in out


def test_failing_insights_costs_only_insights(
    backend, monkeypatch,
):
    def boom(period):
        raise RuntimeError("keine Auswertung")

    monkeypatch.setattr(
        ctx, "_collect_time_insights", boom,
    )
    out = ctx.build_cron_context()
    assert "Bericht schreiben" in out
    assert "keine Auswertung" in out


def test_everything_failing_still_returns_a_block(
    backend, monkeypatch,
):
    def boom(*args, **kwargs):
        raise RuntimeError("alles kaputt")

    for attr, resource in [
        ("tasks", "list_tasks"),
        ("clocks", "list_entries"),
        ("inbox", "list_items"),
        ("customers", "list_customers"),
    ]:
        monkeypatch.setattr(
            type(getattr(backend, attr)), resource, boom,
        )
    monkeypatch.setattr(ctx, "_collect_time_insights", boom)

    out = ctx.build_cron_context()
    assert out.count("unavailable") == len(_HEADINGS)


def test_time_insights_formatting():
    out = ctx._format_time_insights("This week", {
        "billable_hours": 6.0,
        "non_billable_hours": 2.0,
        "by_customer": [
            {"customer": f"K{i}", "hours": float(i)}
            for i in range(8)
        ],
    })
    assert "8.0h total" in out
    assert "75% billable rate" in out
    # Six customers listed, the rest summarised.
    assert out.count("    - K") == 6
    assert "and 2 more" in out


def test_time_insights_with_no_data():
    assert "no This week data" in ctx._format_time_insights(
        "This week", {},
    )
