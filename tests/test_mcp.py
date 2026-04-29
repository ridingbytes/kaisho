"""Tests for the MCP server module."""
import json

from kaisho.mcp.tiers import filter_tools, parse_tiers
from kaisho.mcp.audit import log_call


def test_parse_tiers_read():
    assert parse_tiers("read") == {"read"}


def test_parse_tiers_write_implies_read():
    assert parse_tiers("write") == {"read", "write"}


def test_parse_tiers_destructive_implies_all():
    result = parse_tiers("destructive")
    assert result == {"read", "write", "destructive"}


def test_parse_tiers_comma_separated():
    result = parse_tiers("read,write")
    assert result == {"read", "write"}


def test_parse_tiers_ignores_invalid():
    assert parse_tiers("read,bogus") == {"read"}


def test_parse_tiers_empty():
    assert parse_tiers("") == set()


def test_filter_tools_read_only():
    tools = filter_tools({"read"})
    for t in tools:
        assert t.get("tier", "read") == "read"
    names = {t["name"] for t in tools}
    assert "list_tasks" in names
    assert "add_task" not in names


def test_filter_tools_includes_write():
    tools = filter_tools({"read", "write"})
    names = {t["name"] for t in tools}
    assert "list_tasks" in names
    assert "add_task" in names
    assert "delete_profile" not in names


def test_filter_tools_destructive_includes_all():
    tools = filter_tools({"read", "write", "destructive"})
    names = {t["name"] for t in tools}
    assert "list_tasks" in names
    assert "add_task" in names
    assert "delete_profile" in names


def test_filter_tools_count():
    """Sanity check: all tiers combined returns all tools."""
    from kaisho.cron.tool_defs import TOOL_DEFS
    all_tools = filter_tools(
        {"read", "write", "destructive"},
    )
    assert len(all_tools) == len(TOOL_DEFS)


def test_audit_log(tmp_path):
    log_file = tmp_path / "mcp-audit.log"
    log_call(log_file, "list_tasks", {}, {"tasks": []})
    lines = log_file.read_text().strip().split("\n")
    assert len(lines) == 1
    record = json.loads(lines[0])
    assert record["tool"] == "list_tasks"
    assert record["ok"] is True
    assert "ts" in record


def test_audit_log_error(tmp_path):
    log_file = tmp_path / "mcp-audit.log"
    log_call(
        log_file, "bad_tool", {},
        {"error": "not found"},
    )
    record = json.loads(
        log_file.read_text().strip(),
    )
    assert record["ok"] is False


def test_audit_log_appends(tmp_path):
    log_file = tmp_path / "mcp-audit.log"
    log_call(log_file, "tool_a", {}, {"ok": True})
    log_call(log_file, "tool_b", {}, {"ok": True})
    lines = log_file.read_text().strip().split("\n")
    assert len(lines) == 2


def test_all_tools_have_tier():
    """Every tool in TOOL_DEFS must have a tier field."""
    from kaisho.cron.tool_defs import TOOL_DEFS
    for tool in TOOL_DEFS:
        assert "tier" in tool, (
            f"Tool {tool['name']!r} missing tier"
        )
        assert tool["tier"] in {"read", "write", "destructive"}


# -- Tag coercion --------------------------------------


def test_coerce_tags_none():
    from kaisho.cron.tools import _coerce_tags
    assert _coerce_tags(None) is None


def test_coerce_tags_single_string():
    """Issue #1: a bare string must not be split into
    individual characters by the downstream backend.
    """
    from kaisho.cron.tools import _coerce_tags
    assert _coerce_tags("@github") == ["@github"]


def test_coerce_tags_comma_string():
    from kaisho.cron.tools import _coerce_tags
    assert _coerce_tags("@github, @code") == [
        "@github", "@code",
    ]


def test_coerce_tags_list_passthrough():
    from kaisho.cron.tools import _coerce_tags
    assert _coerce_tags(["@github", "@code"]) == [
        "@github", "@code",
    ]


def test_coerce_tags_list_strips_blanks():
    from kaisho.cron.tools import _coerce_tags
    assert _coerce_tags(["@github", "  ", ""]) == [
        "@github",
    ]


def test_coerce_tags_empty_string_to_none():
    from kaisho.cron.tools import _coerce_tags
    assert _coerce_tags("") is None
    assert _coerce_tags("   ") is None


def test_add_task_tag_string_does_not_split(
    tmp_path, monkeypatch,
):
    """End-to-end: ``add_task(tags='@github')`` must
    produce a single-element ``["@github"]`` list."""
    from kaisho.config import reset_config
    from kaisho.backends import reset_backend
    from kaisho.cron.tools import execute_tool

    profile = tmp_path / "profiles" / "test"
    profile.mkdir(parents=True)
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PROFILE", "test")
    reset_config()
    reset_backend()

    result = execute_tool(
        "add_task",
        {
            "customer": "Acme",
            "title": "Sample Clone",
            "tags": "@github",
        },
    )
    assert result["task"]["tags"] == ["@github"]


def test_set_task_tags_string_does_not_split(
    tmp_path, monkeypatch,
):
    from kaisho.config import reset_config
    from kaisho.backends import reset_backend
    from kaisho.cron.tools import execute_tool

    profile = tmp_path / "profiles" / "test"
    profile.mkdir(parents=True)
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PROFILE", "test")
    reset_config()
    reset_backend()

    created = execute_tool(
        "add_task",
        {"customer": "Acme", "title": "Sample"},
    )
    task_id = created["task"]["id"]
    result = execute_tool(
        "set_task_tags",
        {"task_id": task_id, "tags": "@github"},
    )
    assert result["task"]["tags"] == ["@github"]


# -- Clock + task edit/delete tools (issue #2) ---------


import pytest  # noqa: E402


@pytest.fixture
def clean_profile(tmp_path, monkeypatch):
    """Isolated profile that resets backend caches."""
    from kaisho.config import reset_config
    from kaisho.backends import reset_backend

    profile = tmp_path / "profiles" / "test"
    profile.mkdir(parents=True)
    monkeypatch.setenv("KAISHO_HOME", str(tmp_path))
    monkeypatch.setenv("PROFILE", "test")
    reset_config()
    reset_backend()
    yield profile
    reset_backend()
    reset_config()


def test_book_time_with_start_pins_timestamp(clean_profile):
    from kaisho.cron.tools import execute_tool
    result = execute_tool(
        "book_time",
        {
            "duration": "1h",
            "customer": "Acme",
            "description": "Dev",
            "start": "2026-04-28T14:00:00",
        },
    )
    assert result["entry"]["start"].startswith(
        "2026-04-28T14:00",
    )
    assert result["entry"]["end"].startswith(
        "2026-04-28T15:00",
    )


def test_book_time_with_task_id_links_entry(clean_profile):
    from kaisho.cron.tools import execute_tool
    task = execute_tool(
        "add_task",
        {"customer": "Acme", "title": "Sample"},
    )["task"]
    entry = execute_tool(
        "book_time",
        {
            "duration": "1h",
            "customer": "Acme",
            "description": "Dev",
            "start": "2026-04-28T14:00:00",
            "task_id": task["id"],
        },
    )["entry"]
    assert entry["task_id"] == task["id"]


def test_update_clock_entry_reshapes_window(clean_profile):
    """new_start + new_end together must shift the entry
    to the new window (use case from issue #2: round
    15:02-17:03 to 15:00-17:00)."""
    from kaisho.cron.tools import execute_tool
    entry = execute_tool(
        "book_time",
        {
            "duration": "2h1m",
            "customer": "Acme",
            "description": "Dev",
            "start": "2026-04-28T15:02:00",
        },
    )["entry"]
    updated = execute_tool(
        "update_clock_entry",
        {
            "start": entry["start"],
            "new_start": "2026-04-28T15:00:00",
            "new_end": "2026-04-28T17:00:00",
        },
    )["entry"]
    assert updated["start"].startswith(
        "2026-04-28T15:00",
    )
    assert updated["end"].startswith(
        "2026-04-28T17:00",
    )
    assert updated["duration_minutes"] == 120


def test_update_clock_entry_changes_task(clean_profile):
    """Re-link an existing entry to a different task."""
    from kaisho.cron.tools import execute_tool
    t1 = execute_tool(
        "add_task",
        {"customer": "Acme", "title": "First"},
    )["task"]
    t2 = execute_tool(
        "add_task",
        {"customer": "Acme", "title": "Second"},
    )["task"]
    entry = execute_tool(
        "book_time",
        {
            "duration": "1h",
            "customer": "Acme",
            "description": "Dev",
            "start": "2026-04-28T15:00:00",
            "task_id": t1["id"],
        },
    )["entry"]
    updated = execute_tool(
        "update_clock_entry",
        {
            "start": entry["start"],
            "task_id": t2["id"],
        },
    )["entry"]
    assert updated["task_id"] == t2["id"]


def test_update_clock_entry_new_end_without_start_errors(
    clean_profile,
):
    from kaisho.cron.tools import execute_tool
    entry = execute_tool(
        "book_time",
        {
            "duration": "1h",
            "customer": "Acme",
            "description": "Dev",
            "start": "2026-04-28T15:00:00",
        },
    )["entry"]
    result = execute_tool(
        "update_clock_entry",
        {
            "start": entry["start"],
            "new_end": "2026-04-28T18:00:00",
        },
    )
    assert "error" in result


def test_delete_clock_entry(clean_profile):
    from kaisho.cron.tools import execute_tool
    entry = execute_tool(
        "book_time",
        {
            "duration": "1h",
            "customer": "Acme",
            "description": "Dev",
            "start": "2026-04-28T15:00:00",
        },
    )["entry"]
    result = execute_tool(
        "delete_clock_entry",
        {"sync_id": entry["sync_id"]},
    )
    assert result["deleted"] is True
    assert result["sync_id"] == entry["sync_id"]
    listed = execute_tool(
        "list_clock_entries", {"period": "all"},
    )["entries"]
    assert listed == []


def test_delete_clock_entry_by_start_fallback(
    clean_profile,
):
    """``start`` still works when sync_id isn't passed."""
    from kaisho.cron.tools import execute_tool
    entry = execute_tool(
        "book_time",
        {
            "duration": "1h",
            "customer": "Acme",
            "description": "Dev",
            "start": "2026-04-28T15:00:00",
        },
    )["entry"]
    result = execute_tool(
        "delete_clock_entry",
        {"start": entry["start"]},
    )
    assert result["deleted"] is True


def test_delete_clock_entry_not_found(clean_profile):
    from kaisho.cron.tools import execute_tool
    result = execute_tool(
        "delete_clock_entry",
        {"start": "2099-01-01T00:00:00"},
    )
    assert "error" in result


def test_delete_clock_entry_requires_id(clean_profile):
    from kaisho.cron.tools import execute_tool
    result = execute_tool("delete_clock_entry", {})
    assert "error" in result


def test_update_clock_entry_by_sync_id_resolves_collision(
    clean_profile,
):
    """Two entries that share a start time must be
    updated independently when identified by sync_id."""
    from kaisho.cron.tools import execute_tool
    a = execute_tool(
        "book_time",
        {
            "duration": "1h",
            "customer": "Acme",
            "description": "Alpha",
            "start": "2026-04-28T09:00:00",
        },
    )["entry"]
    b = execute_tool(
        "book_time",
        {
            "duration": "2h",
            "customer": "EuroLab",
            "description": "Beta",
            "start": "2026-04-28T09:00:00",
        },
    )["entry"]
    assert a["start"] == b["start"]
    assert a["sync_id"] != b["sync_id"]

    updated = execute_tool(
        "update_clock_entry",
        {
            "sync_id": b["sync_id"],
            "invoiced": True,
        },
    )["entry"]
    assert updated["sync_id"] == b["sync_id"]
    assert updated["invoiced"] is True

    entries = execute_tool(
        "list_clock_entries", {"period": "all"},
    )["entries"]
    by_sync = {e["sync_id"]: e for e in entries}
    assert by_sync[a["sync_id"]]["invoiced"] is False
    assert by_sync[b["sync_id"]]["invoiced"] is True


def test_delete_task_removes_from_active_board(
    clean_profile,
):
    from kaisho.cron.tools import execute_tool
    task = execute_tool(
        "add_task",
        {"customer": "Acme", "title": "Doomed"},
    )["task"]
    result = execute_tool(
        "delete_task", {"task_id": task["id"]},
    )
    assert result == {
        "deleted": True,
        "task_id": task["id"],
    }
    listed = execute_tool(
        "list_tasks", {},
    )["tasks"]
    assert all(
        t["id"] != task["id"] for t in listed
    )


def test_delete_task_not_found(clean_profile):
    from kaisho.cron.tools import execute_tool
    result = execute_tool(
        "delete_task", {"task_id": "nonexistent"},
    )
    assert "error" in result


def test_new_tools_registered_in_destructive_tier():
    """delete_clock_entry and delete_task must require
    the destructive tier so MCP clients with read/write
    only cannot remove data."""
    write_only = filter_tools({"read", "write"})
    write_names = {t["name"] for t in write_only}
    assert "delete_clock_entry" not in write_names
    assert "delete_task" not in write_names

    destructive = filter_tools(
        {"read", "write", "destructive"},
    )
    dest_names = {t["name"] for t in destructive}
    assert "delete_clock_entry" in dest_names
    assert "delete_task" in dest_names
