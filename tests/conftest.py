"""Shared pytest fixtures."""
import tempfile
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _reset_tool_guards():
    """Reset the per-session write counters AND the
    process-wide auto-snapshot throttle before every test.

    Tests call ``execute_tool`` ad-hoc without going
    through an agentic loop, so without this fixture the
    cumulative count would leak across tests on the same
    worker thread and trip the cap mid-suite. The
    throttle reset matters for any test that exercises
    the snapshot path -- otherwise the order in which
    ``pytest`` happens to run the suite would silently
    skip backups for whichever test came second within a
    10-minute window.
    """
    from kaisho.cron import guards
    guards.reset_session()
    guards._last_auto_snapshot = None  # noqa: SLF001
    yield


@pytest.fixture
def tmp_dir(tmp_path):
    """Provide a temporary directory as a Path."""
    return tmp_path


@pytest.fixture
def org_dir(tmp_path):
    """Temporary org directory with minimal required files."""
    d = tmp_path / "org"
    d.mkdir()
    (d / "todos.org").write_text("", encoding="utf-8")
    (d / "clocks.org").write_text("", encoding="utf-8")
    (d / "customers.org").write_text("", encoding="utf-8")
    (d / "inbox.org").write_text("", encoding="utf-8")
    (d / "archive.org").write_text("", encoding="utf-8")
    return d


@pytest.fixture
def db_file(tmp_path):
    """Temporary SQLite database file path."""
    return tmp_path / "test.db"
