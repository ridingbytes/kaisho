"""Tests for the ``KAISHO_TRACE_SUBPROC`` spawn tracer.

The tracer monkey-patches ``subprocess.Popen.__init__``, so
each test installs into a private base dir and restores the
original ``__init__`` afterwards. Without that, a failure in
one test would leak the patch into the next.
"""
import subprocess

import pytest

from kaisho import subproc


@pytest.fixture
def trace_env(tmp_path, monkeypatch):
    """Point the tracer at ``tmp_path`` and reset its state.

    Returns the path the tracer will write to so tests can
    inspect it.
    """
    monkeypatch.setenv("KAISHO_HOME", str(tmp_path))
    monkeypatch.setenv("KAISHO_TRACE_SUBPROC", "1")
    original_init = subprocess.Popen.__init__
    subproc._TRACE_INSTALLED = False
    subproc._ORIGINAL_POPEN_INIT = None
    yield tmp_path / "subproc-trace.log"
    subprocess.Popen.__init__ = original_init
    subproc._TRACE_INSTALLED = False
    subproc._ORIGINAL_POPEN_INIT = None


def test_install_trace_returns_false_without_env(
    tmp_path, monkeypatch,
):
    monkeypatch.setenv("KAISHO_HOME", str(tmp_path))
    monkeypatch.delenv("KAISHO_TRACE_SUBPROC", raising=False)
    assert subproc.install_trace() is False
    assert not (tmp_path / "subproc-trace.log").exists()


def test_install_trace_logs_each_spawn(trace_env):
    assert subproc.install_trace() is True
    subproc.run(
        ["python", "-c", "print(1)"],
        capture_output=True,
    )
    text = trace_env.read_text()
    assert "subproc tracer installed" in text
    assert "python" in text


def test_install_trace_is_idempotent(trace_env):
    assert subproc.install_trace() is True
    assert subproc.install_trace() is True
    text = trace_env.read_text()
    # Only one "installed" banner even though install_trace
    # was called twice.
    assert text.count("tracer installed") == 1
