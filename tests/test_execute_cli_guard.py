"""Guards on the advisor/cron `execute_cli` tool.

execute_cli is reachable by the AI advisor and cron, both of
which are exposed to prompt injection, so it must reject
destructive and non-allowlisted commands before running them.
These cases all return before invoking `kai`, so no backend or
profile is required.
"""
from kaisho.cron.tools import _execute_cli


def test_blocks_destructive_verb():
    result = _execute_cli("task delete 03c0edbf --yes")
    assert "error" in result
    assert "destructive" in result["error"]


def test_blocks_destructive_without_flag():
    assert "error" in _execute_cli("note remove n1")
    assert "error" in _execute_cli("customer delete Acme")


def test_blocks_confirm_flags():
    assert "destructive" in _execute_cli(
        "clock book 1h Acme --force"
    )["error"]


def test_blocks_non_allowlisted_command():
    for cmd in ("config backend", "profiles list",
                "serve", "convert org json", "mcp-server"):
        result = _execute_cli(cmd)
        assert "error" in result
        assert "not allowed" in result["error"]


def test_empty_command():
    assert _execute_cli("   ") == {"error": "empty command"}
