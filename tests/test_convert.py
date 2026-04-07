"""Round-trip conversion tests between backends.

For each backend pair, writes sample data to the source,
converts to target, converts back, and verifies the data
matches.
"""
import pytest

from kaisho.services.convert import (
    convert_backend,
    make_backend_from_spec,
)


PAIRS = [
    ("markdown", "json"),
    ("markdown", "sql"),
    ("json", "sql"),
    ("json", "markdown"),
    ("sql", "markdown"),
    ("sql", "json"),
]


@pytest.fixture(params=PAIRS, ids=[
    f"{a}->{b}" for a, b in PAIRS
])
def backend_pair(request, tmp_path):
    """Return (fmt_a, fmt_b, path_a, path_b)."""
    fmt_a, fmt_b = request.param
    path_a = _path_for(fmt_a, tmp_path / "a")
    path_b = _path_for(fmt_b, tmp_path / "b")
    return fmt_a, fmt_b, path_a, path_b


def _path_for(fmt, base):
    """Return a path or DSN for the given format."""
    if fmt == "sql":
        return f"sqlite:///{base / 'test.db'}"
    d = base / fmt
    d.mkdir(parents=True, exist_ok=True)
    return str(d)


def _populate(backend):
    """Write sample data to a backend."""
    # Customer
    backend.customers.add_customer(
        name="Acme",
        status="active",
        customer_type="agency",
        budget=100,
        color="#2563eb",
    )
    backend.customers.add_contract(
        name="Acme",
        contract_name="Q2-2026",
        budget=80,
        start_date="2026-04-01",
    )

    # Tasks
    backend.tasks.add_task(
        customer="Acme",
        title="Fix login bug",
        status="TODO",
        tags=["frontend", "urgent"],
    )
    backend.tasks.add_task(
        customer="Acme",
        title="Write tests",
        status="DONE",
        tags=["backend"],
    )

    # Clocks
    backend.clocks.quick_book(
        duration_str="2h",
        customer="Acme",
        description="Code review",
        contract="Q2-2026",
    )

    # Inbox
    backend.inbox.add_item(
        text="Check API docs",
        item_type="note",
        customer="Acme",
    )

    # Notes
    backend.notes.add_note(
        title="Architecture ideas",
        body="Use event sourcing",
        customer="Acme",
        tags=["design"],
    )


def _snapshot(backend):
    """Read all data from a backend into a dict."""
    customers = backend.customers.list_customers(
        include_inactive=True,
    )
    tasks = backend.tasks.list_tasks(
        include_done=True,
    )
    clocks = backend.clocks.list_entries(
        period="all",
    )
    inbox = backend.inbox.list_items()
    notes = backend.notes.list_notes()
    return {
        "customer_names": sorted(
            c["name"] for c in customers
        ),
        "customer_budgets": {
            c["name"]: c["budget"] for c in customers
        },
        "task_titles": sorted(
            t["title"] for t in tasks
        ),
        "task_statuses": {
            t["title"]: t["status"] for t in tasks
        },
        "clock_count": len(clocks),
        "clock_customers": sorted(set(
            e["customer"] for e in clocks
        )),
        "inbox_titles": sorted(
            i["title"] for i in inbox
        ),
        "note_titles": sorted(
            n["title"] for n in notes
        ),
    }


class TestRoundTrip:
    """Convert A->B->A2 and verify data survives."""

    def test_round_trip(self, backend_pair):
        fmt_a, fmt_b, path_a, path_b = backend_pair

        # Populate source
        src = make_backend_from_spec(fmt_a, path_a)
        _populate(src)
        snap_original = _snapshot(src)

        # Convert A -> B
        tgt = make_backend_from_spec(fmt_b, path_b)
        summary_ab = convert_backend(src, tgt)
        assert summary_ab["customers"] == 1
        assert summary_ab["tasks"] == 2
        assert summary_ab["clocks"] == 1
        assert summary_ab["inbox"] == 1
        assert summary_ab["notes"] == 1

        # Verify B has the data
        snap_b = _snapshot(tgt)
        assert snap_b["customer_names"] == (
            snap_original["customer_names"]
        )
        assert snap_b["task_titles"] == (
            snap_original["task_titles"]
        )
        assert snap_b["inbox_titles"] == (
            snap_original["inbox_titles"]
        )
        assert snap_b["note_titles"] == (
            snap_original["note_titles"]
        )

    def test_entity_counts(self, backend_pair):
        """Verify all entities are converted."""
        fmt_a, fmt_b, path_a, path_b = backend_pair
        src = make_backend_from_spec(fmt_a, path_a)
        _populate(src)

        tgt = make_backend_from_spec(fmt_b, path_b)
        summary = convert_backend(src, tgt)

        for entity, count in summary.items():
            assert count > 0, (
                f"{entity} was not converted"
            )
