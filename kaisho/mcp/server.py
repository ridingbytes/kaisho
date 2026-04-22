"""Kaisho MCP server.

Exposes Kaisho tools via the Model Context Protocol (stdio).
Reuses the same ``execute_tool()`` dispatcher as the cron
executor and advisor, so tool behavior is identical.
"""
import json
import os
from pathlib import Path
from typing import Any

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

# Map JSON schema types to Python type annotations
_TYPE_MAP = {
    "string": "str",
    "integer": "int",
    "number": "float",
    "boolean": "bool",
}


def _build_handler(
    tool_name: str,
    schema: dict,
    audit_file: Path,
):
    """Build a tool handler function with a typed signature.

    FastMCP requires explicit parameter signatures (no
    ``**kwargs``).  This generates a function whose
    parameters match the tool's ``input_schema``.
    """
    props = schema.get("properties", {})
    required = set(schema.get("required", []))

    # Build parameter strings
    param_parts = []
    param_names = []
    for pname, pdef in props.items():
        py_type = _TYPE_MAP.get(
            pdef.get("type", "string"), "str",
        )
        if pname in required:
            param_parts.append(f"{pname}: {py_type}")
        else:
            param_parts.append(
                f"{pname}: {py_type} | None = None",
            )
        param_names.append(pname)

    params_str = ", ".join(param_parts)
    names_str = ", ".join(
        f'"{n}": {n}' for n in param_names
    )

    # The handler collects non-None args and dispatches.
    # exec() is used here to generate functions with
    # proper typed signatures required by FastMCP.
    # All inputs are from trusted tool_defs.py constants,
    # not from user input.
    func_code = (
        f"def {tool_name}({params_str}) -> str:\n"
        f"    args = {{{names_str}}}\n"
        f"    args = {{k: v for k, v in args.items()"
        f" if v is not None}}\n"
        f"    return _dispatch("
        f'"{tool_name}", args, _audit)\n'
    )

    ns: dict[str, Any] = {
        "_dispatch": _dispatch_call,
        "_audit": audit_file,
    }
    exec(func_code, ns)  # noqa: S102
    fn = ns[tool_name]
    fn.__doc__ = f"MCP handler for {tool_name}."
    return fn


def _dispatch_call(
    name: str, args: dict, audit_file: Path,
) -> str:
    """Execute a tool and return JSON result."""
    result = execute_tool(name, args)
    log_call(audit_file, name, args, result)
    if "error" in result:
        raise RuntimeError(result["error"])
    return json.dumps(result, default=str)


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
        schema = tool_def["input_schema"]

        handler = _build_handler(name, schema, audit_file)

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
