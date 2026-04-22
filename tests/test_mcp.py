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
