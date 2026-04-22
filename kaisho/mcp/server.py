"""Kaisho MCP server.

Exposes Kaisho tools via the Model Context Protocol (stdio).
Reuses the same ``execute_tool()`` dispatcher as the cron
executor and advisor, so tool behavior is identical.
"""
import json
import os
from pathlib import Path

from fastmcp import FastMCP

from ..config import get_config, reset_config
from ..cron.tools import execute_tool
from .audit import log_call
from .tiers import filter_tools, parse_tiers

# Tier annotations for MCP client hints
_TIER_ANNOTATIONS = {
    "read": {
        "readOnlyHint": True,
        "destructiveHint": False,
    },
    "write": {
        "readOnlyHint": False,
        "destructiveHint": False,
    },
    "destructive": {
        "readOnlyHint": False,
        "destructiveHint": True,
    },
}


def _make_handler(tool_name: str, audit_file: Path):
    """Create a tool handler closure for a tool name."""

    def handler(**kwargs) -> str:
        """Execute tool and return JSON result."""
        result = execute_tool(tool_name, kwargs)
        log_call(audit_file, tool_name, kwargs, result)
        if "error" in result:
            raise RuntimeError(result["error"])
        return json.dumps(result, default=str)

    handler.__name__ = tool_name
    handler.__doc__ = tool_name
    return handler


def create_server(
    profile: str | None = None,
    allow: str = "read",
) -> FastMCP:
    """Create and configure the MCP server.

    :param profile: Profile name (uses active profile
        if None).
    :param allow: Comma-separated tier string.
    :returns: Configured FastMCP instance.
    """
    if profile:
        os.environ["PROFILE"] = profile
    reset_config()
    cfg = get_config()

    allowed = parse_tiers(allow)
    tools = filter_tools(allowed)
    audit_file = Path(str(cfg.PROFILE_DIR)) / "mcp-audit.log"

    mcp = FastMCP(
        name="kaisho",
        instructions=(
            "Kaisho personal productivity system. "
            "Use these tools to manage tasks, time "
            "tracking, customers, notes, and knowledge "
            f"base. Profile: {cfg.PROFILE}."
        ),
    )

    for tool_def in tools:
        name = tool_def["name"]
        tier = tool_def.get("tier", "read")
        annotations = _TIER_ANNOTATIONS.get(tier, {})
        handler = _make_handler(name, audit_file)

        mcp.tool(
            name=name,
            description=tool_def["description"],
            annotations=annotations,
        )(handler)

    return mcp


def run_server(
    profile: str | None = None,
    allow: str = "read",
) -> None:
    """Create and run the MCP server (stdio transport)."""
    server = create_server(profile=profile, allow=allow)
    server.run(transport="stdio")
