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
