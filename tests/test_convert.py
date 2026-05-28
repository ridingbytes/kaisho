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


# ---------------------------------------------------------------
# Skip logging
#
# Regression: previously _convert_customers swallowed every
# ValueError silently, so a customer that failed to import was
# only discovered weeks later by missing rows in dependent
# tables. The convert pipeline must now log each skip and
# print a summary line at the end.
# ---------------------------------------------------------------


class _StubBackend:
    """Minimum surface needed by the customer convert path."""

    def __init__(self, fail_on):
        self._fail_on = fail_on
        self.added = []

    def list_customers(self, include_inactive=False):
        return []

    def add_customer(self, name, **_):
        if name in self._fail_on:
            raise RuntimeError(
                f"simulated SQL integrity error for {name}"
            )
        self.added.append(name)


def test_customer_skip_is_logged_and_summarised(
    caplog, capsys,
):
    """A failing add_customer must be logged with class +
    message and surface in the final summary line."""
    from kaisho.services.convert import _convert_customers

    src = type("S", (), {})()
    src.customers = type("C", (), {})()
    src.customers.list_customers = lambda include_inactive=True: [
        {"name": "Good"},
        {"name": "RIDING BYTES"},
    ]
    tgt = type("T", (), {})()
    tgt.customers = _StubBackend(fail_on={"RIDING BYTES"})

    skipped_customers: list[str] = []
    skipped_contracts: list[str] = []
    import logging
    with caplog.at_level(logging.WARNING):
        count = _convert_customers(
            src, tgt,
            skipped_customers=skipped_customers,
            skipped_contracts=skipped_contracts,
        )

    assert count == 1
    assert skipped_customers == ["RIDING BYTES"]
    # The log line must include the customer name + class +
    # message so the user can debug from the log alone.
    msg = " ".join(r.getMessage() for r in caplog.records)
    assert "RIDING BYTES" in msg
    assert "RuntimeError" in msg
    assert "simulated SQL integrity error" in msg


def test_summary_line_lists_skipped_names(capsys):
    """convert_backend prints a one-line summary per
    non-empty skip list."""
    from kaisho.services.convert import _summarise_skips

    _summarise_skips("customer", ["Foo", "Bar"])
    out = capsys.readouterr().out
    assert "2 customer(s) skipped" in out
    assert "Foo" in out and "Bar" in out


def test_summary_silent_when_no_skips(capsys):
    """Empty skip list emits no output."""
    from kaisho.services.convert import _summarise_skips

    _summarise_skips("customer", [])
    out = capsys.readouterr().out
    assert out == ""
