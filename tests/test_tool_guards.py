"""Tests for :mod:`kaisho.cron.guards` and the
hardened ``write_kb_file`` tool.

The guards are the load-bearing safety nets in front of
the AI agentic loops -- they block runaway writes,
KB-specific over-budget calls, and silent overwrites.
The tests exercise the boundary conditions because a
silent regression here is the difference between a
bounded mistake and a mass-delete event.
"""
from unittest.mock import patch

import pytest

from kaisho.cron import guards
from kaisho.cron.tools import (
    advisor_safe_tool_defs,
    cron_safe_tool_defs,
    execute_tool,
)


@pytest.fixture
def clean_profile(tmp_path, monkeypatch):
    """Isolated profile that resets backend caches.

    Mirrors the fixture in ``tests/test_mcp.py``. Kept
    local so this file stays self-contained and the
    guards suite can run on its own.
    """
    from kaisho.backends import reset_backend
    from kaisho.config import reset_config

    profile = tmp_path / "profiles" / "test"
    profile.mkdir(parents=True)
    monkeypatch.setenv("KAISHO_HOME", str(tmp_path))
    monkeypatch.setenv("PROFILE", "test")
    reset_config()
    reset_backend()
    yield profile
    reset_backend()
    reset_config()


def test_advisor_excludes_destructive_tools():
    names = {t["name"] for t in advisor_safe_tool_defs()}
    forbidden = {
        "delete_task", "delete_note", "delete_customer",
        "delete_profile", "delete_clock_entry",
        "rename_profile",
    }
    assert not (names & forbidden), (
        f"advisor must not see destructive tools: "
        f"{names & forbidden}"
    )


def test_advisor_includes_writes_and_reads():
    names = {t["name"] for t in advisor_safe_tool_defs()}
    assert "add_task" in names
    assert "write_kb_file" in names
    assert "search_knowledge" in names


def test_cron_excludes_writes_and_destructives():
    names = {t["name"] for t in cron_safe_tool_defs()}
    assert "add_task" not in names
    assert "write_kb_file" not in names
    assert "delete_task" not in names


def test_check_caps_read_is_unbounded():
    guards.reset_session()
    for _ in range(50):
        assert guards.check_caps(
            "search_knowledge", "read",
        ) is None


def test_check_caps_write_cap_trips():
    guards.reset_session()
    for _ in range(guards.MAX_WRITES_PER_RUN):
        assert guards.check_caps(
            "add_task", "write",
        ) is None
    err = guards.check_caps("add_task", "write")
    assert err is not None and "Write limit" in err["error"]


def test_check_caps_kb_write_cap_trips_first():
    guards.reset_session()
    for _ in range(guards.MAX_KB_WRITES_PER_RUN):
        assert guards.check_caps(
            "write_kb_file", "write",
        ) is None
    err = guards.check_caps("write_kb_file", "write")
    assert err is not None
    assert "Knowledge-base" in err["error"]


def test_reset_session_clears_counters():
    guards.reset_session()
    for _ in range(guards.MAX_WRITES_PER_RUN):
        guards.check_caps("add_task", "write")
    guards.reset_session()
    assert guards.check_caps("add_task", "write") is None


def test_auto_snapshot_runs_once_per_session():
    guards.reset_session()
    guards._last_auto_snapshot = None  # type: ignore[attr-defined]  # noqa: SLF001
    with patch.object(guards, "_take_snapshot") as snap:
        guards.maybe_auto_snapshot("add_task", "write")
        guards.maybe_auto_snapshot("add_task", "write")
        guards.maybe_auto_snapshot("add_task", "write")
    assert snap.call_count == 1


def test_auto_snapshot_skipped_for_reads():
    guards.reset_session()
    with patch.object(guards, "_take_snapshot") as snap:
        guards.maybe_auto_snapshot("list_tasks", "read")
    assert snap.call_count == 0


def test_auto_snapshot_skipped_for_create_backup_itself():
    guards.reset_session()
    guards._last_auto_snapshot = None  # type: ignore[attr-defined]  # noqa: SLF001
    with patch.object(guards, "_take_snapshot") as snap:
        guards.maybe_auto_snapshot("create_backup", "write")
    assert snap.call_count == 0


def test_write_kb_file_refuses_oversized_payload(
    clean_profile,
):
    big = "x" * 2_000_000
    result = execute_tool(
        "write_kb_file",
        {
            "label": "knowledge",
            "filename": "huge.md",
            "content": big,
        },
    )
    assert "error" in result
    assert "limit" in result["error"]


def test_write_kb_file_refuses_silent_overwrite(
    clean_profile,
):
    first = execute_tool(
        "write_kb_file",
        {
            "label": "knowledge",
            "filename": "kept.md",
            "content": "original",
        },
    )
    assert "file" in first
    second = execute_tool(
        "write_kb_file",
        {
            "label": "knowledge",
            "filename": "kept.md",
            "content": "replacement",
        },
    )
    assert "error" in second
    assert "already exists" in second["error"]


def test_caps_interaction_kb_and_general_share_budget():
    """KB writes count toward BOTH caps. Three KB writes
    plus two non-KB writes should still be allowed (5
    total) but a sixth call must be rejected."""
    guards.reset_session()
    for _ in range(guards.MAX_KB_WRITES_PER_RUN):
        assert guards.check_caps(
            "write_kb_file", "write",
        ) is None
    rest = (
        guards.MAX_WRITES_PER_RUN
        - guards.MAX_KB_WRITES_PER_RUN
    )
    for _ in range(rest):
        assert guards.check_caps(
            "add_task", "write",
        ) is None
    err = guards.check_caps("add_task", "write")
    assert err is not None
    assert "Write limit" in err["error"]


def test_auto_snapshot_failure_clears_throttle():
    """A failed snapshot must reset the throttle slot so
    the next non-read tool call retries instead of being
    locked out by the 10-minute window we never actually
    used."""
    guards.reset_session()
    guards._last_auto_snapshot = None  # type: ignore[attr-defined]  # noqa: SLF001
    with patch.object(
        guards, "_take_snapshot", return_value=False,
    ):
        guards.maybe_auto_snapshot("add_task", "write")
    assert guards._snapshotted() is False  # noqa: SLF001
    assert guards._last_auto_snapshot is None  # type: ignore[attr-defined]  # noqa: SLF001


def test_auto_snapshot_throttle_window_skips_repeat():
    """Once a snapshot has succeeded, a fresh session
    inside the throttle window flips ``snapshotted``
    without calling the backup again."""
    guards.reset_session()
    guards._last_auto_snapshot = None  # type: ignore[attr-defined]  # noqa: SLF001
    with patch.object(
        guards, "_take_snapshot", return_value=True,
    ) as snap:
        guards.maybe_auto_snapshot("add_task", "write")
    assert snap.call_count == 1
    # Simulate a second session on the same thread.
    guards.reset_session()
    with patch.object(guards, "_take_snapshot") as snap2:
        guards.maybe_auto_snapshot("add_task", "write")
    assert snap2.call_count == 0
    assert guards._snapshotted() is True  # noqa: SLF001


def test_advisor_can_archive_tasks():
    """Archive is reversible -- moving it from
    destructive to write at code review time means the
    advisor's allowlist now includes it."""
    names = {t["name"] for t in advisor_safe_tool_defs()}
    assert "archive_task" in names


def test_advisor_blocked_from_skill_and_cron_trigger():
    """create_skill rewrites every future system prompt;
    trigger_cron_job spawns a fresh agentic loop with a
    new write budget. Both promoted to ``destructive``
    and must NOT be in the advisor's toolbox."""
    names = {t["name"] for t in advisor_safe_tool_defs()}
    assert "create_skill" not in names
    assert "trigger_cron_job" not in names


def test_write_kb_file_overwrite_true_replaces(
    clean_profile,
):
    execute_tool(
        "write_kb_file",
        {
            "label": "knowledge",
            "filename": "kept.md",
            "content": "v1",
        },
    )
    result = execute_tool(
        "write_kb_file",
        {
            "label": "knowledge",
            "filename": "kept.md",
            "content": "v2",
            "overwrite": True,
        },
    )
    assert "file" in result
    assert result["overwritten"] is True
