"""Kaisho MCP server.

Exposes Kaisho tools via the Model Context Protocol (stdio).
Reuses the same ``execute_tool()`` dispatcher as the cron
executor and advisor, so tool behavior is identical.
"""
import json
import os
import re
import threading
from pathlib import Path
from typing import Any

from fastmcp import FastMCP

from ..config import get_config, reset_config
from ..cron.tools import execute_tool
from .audit import log_call
from .tiers import filter_tools, parse_tiers

# Valid Python identifier pattern for exec() safety
_IDENT_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")

# Module-level mutable state for the follow-active-profile
# behavior. ``_profile_pinned`` is True when the server was
# launched with an explicit ``--profile`` pin; in that case
# the MCP process stays on that profile regardless of UI
# switches. When False, every dispatch re-reads
# ``.active_profile`` and follows the running ``kai serve``
# instance so tools land in the right profile after a
# switch.
#
# ``_profile_lock`` guards the env / config / backend flip
# triple so two concurrent dispatches can't read a torn
# mid-flip state. FastMCP stdio dispatches are typically
# serial, but the lock makes the contract explicit and
# defends against any future async dispatcher.
_profile_pinned = False
_profile_lock = threading.Lock()

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
    if not _IDENT_RE.match(tool_name):
        raise ValueError(
            f"Invalid tool name: {tool_name!r}"
        )
    props = schema.get("properties", {})
    required = set(schema.get("required", []))

    # Build parameter strings — required params first
    # to avoid SyntaxError from optional before required.
    sorted_props = sorted(
        props.items(),
        key=lambda item: item[0] not in required,
    )
    param_parts = []
    param_names = []
    for pname, pdef in sorted_props:
        # Guard against code injection via crafted
        # parameter names — only valid Python identifiers.
        if not _IDENT_RE.match(pname):
            raise ValueError(
                f"Invalid parameter name: {pname!r}"
            )
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
    """Execute a tool and return JSON result.

    Each MCP request is treated as a fresh session so the
    per-session caps (write count, KB-write count,
    auto-snapshot flag) don't accumulate across calls
    from a long-lived MCP client. A single request that
    chain-fires several tools internally is still bounded
    by the run's caps; resetting at the request boundary
    just stops the budget from monotonically depleting
    over the lifetime of the connection.

    When the server was not pinned to a specific profile at
    launch, every dispatch re-reads ``.active_profile`` and
    rebuilds the config + backend if the user has switched
    profiles in the running ``kai serve`` instance. The
    audit log is re-pointed at the new profile too, so
    traceability follows the data.
    """
    from ..cron import guards
    audit_file = _follow_active_profile(audit_file)
    guards.reset_session()
    result = execute_tool(name, args)
    log_call(audit_file, name, args, result)
    if "error" in result:
        raise RuntimeError(result["error"])
    return json.dumps(result, default=str)


def _follow_active_profile(audit_file: Path) -> Path:
    """Re-sync the MCP process to the currently active
    profile when launched without a ``--profile`` pin.

    Returns the audit-log path for the (possibly switched)
    active profile. When pinned, returns ``audit_file``
    unchanged. The env / config / backend flip is held
    under ``_profile_lock`` so concurrent dispatches can't
    see a half-flipped state.
    """
    if _profile_pinned:
        return audit_file
    from ..backends import reset_backend
    from ..config import init_data_dir, load_active_profile
    with _profile_lock:
        cfg = get_config()
        active = load_active_profile(cfg.DATA_DIR)
        if not active or active == cfg.PROFILE:
            return audit_file
        os.environ["PROFILE"] = active
        cfg = reset_config()
        init_data_dir(cfg)
        reset_backend()
        return Path(str(cfg.PROFILE_DIR)) / "mcp-audit.log"


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
    global _profile_pinned
    _profile_pinned = bool(profile)
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
