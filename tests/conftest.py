"""Shared pytest fixtures."""
import tempfile
from pathlib import Path

import pytest


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
