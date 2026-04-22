# MCP Server Integration Plan

Based on the evaluation in `docs/mcp-evaluation.md` (branch
`claude/mcp-kaisho-evaluation-DIS8r`). This plan covers
everything needed to implement a working MCP server for Kaisho.

Status: **Ready for implementation.**


## Decision Summary

- Direction: **Kaisho as MCP server** (Richtung 1).
- Transport: **stdio** (local-first, no network auth needed).
- Library: **FastMCP** (`fastmcp` PyPI package).
- Architecture: **Direct service access** (like cron executor),
  not HTTP client to the running FastAPI server.
- Distribution: Part of kaisho-core, not a separate package.
- CLI entry: `kai mcp-server [--profile NAME] [--allow TIERS]`


## File Changes Overview

```
kaisho/
  mcp/                          NEW directory
    __init__.py                 Package init
    server.py                   FastMCP server definition
    tiers.py                    Tool tier classification
    audit.py                    Audit logging
  cli/
    main.py                     Add mcp-server command
  cron/
    tool_defs.py                Add "tier" field to each tool def
pyproject.toml                  Add fastmcp dependency
```

Total: 4 new files, 3 modified files. No existing logic
changes, only additions.


## Step 1: Add `tier` Field to Tool Definitions

File: `kaisho/cron/tool_defs.py`

Add a `"tier"` key to every dict in `TOOL_DEFS`. This field is
ignored by the existing `openai_tools()` and `execute_tool()`
code (they only read `name`, `description`, `input_schema`), so
zero risk to the advisor or cron systems.

Tier classification:

```
read:
  list_tasks, list_inbox, list_clock_entries,
  list_customers, list_contracts, list_notes,
  list_kb_files, list_profiles, search_knowledge,
  read_knowledge_file, list_github_projects,
  list_github_issues, list_cron_jobs, list_backups,
  get_time_insights, transcribe_youtube, web_search,
  fetch_url

write:
  add_task, update_task, set_task_tags, move_task,
  add_inbox_item, start_clock, stop_clock, book_time,
  update_clock_entry, batch_invoice, add_note,
  update_note, write_kb_file, create_skill,
  approve_url_domain, create_backup, trigger_cron_job

destructive:
  archive_task, delete_note, delete_profile,
  rename_profile, execute_cli
```

Rationale for edge cases:
- `move_task` is write (changes status, not a delete).
- `stop_clock` is write (stops a timer, data preserved).
- `execute_cli` is destructive (arbitrary command execution).
- `batch_invoice` is write (marks entries, reversible).

Example change in `tool_defs.py`:

```python
{
    "name": "list_tasks",
    "tier": "read",          # <-- new field
    "description": "List tasks from the kanban board. ...",
    "input_schema": { ... },
},
```


## Step 2: Add `fastmcp` Dependency

File: `pyproject.toml`

Add to the dependencies list:

```toml
"fastmcp>=2.0",
```

FastMCP v2 supports stdio transport out of the box and handles
the MCP protocol (JSON-RPC over stdin/stdout, tool listing,
tool execution). It is the recommended library from the MCP
spec authors.


## Step 3: Create `kaisho/mcp/` Package

### 3a: `kaisho/mcp/__init__.py`

Empty file (package marker).


### 3b: `kaisho/mcp/tiers.py`

Tool tier filtering logic. Reads tier assignments from
`TOOL_DEFS` and filters the tool list based on allowed tiers.

```python
"""Tool tier filtering for the MCP server."""
from ..cron.tool_defs import TOOL_DEFS

VALID_TIERS = {"read", "write", "destructive"}


def filter_tools(
    allowed: set[str],
) -> list[dict]:
    """Return tool defs whose tier is in allowed set."""
    return [
        t for t in TOOL_DEFS
        if t.get("tier", "read") in allowed
    ]


def parse_tiers(tier_str: str) -> set[str]:
    """Parse comma-separated tier string.

    'write' implies 'read'. 'destructive' implies both.
    """
    tiers = {
        t.strip() for t in tier_str.split(",")
    }
    if "destructive" in tiers:
        tiers |= {"read", "write"}
    elif "write" in tiers:
        tiers.add("read")
    return tiers & VALID_TIERS
```


### 3c: `kaisho/mcp/audit.py`

Audit logging for MCP tool calls. Writes one JSON line per
call to `data/profiles/<profile>/mcp-audit.log`.

```python
"""Audit logging for MCP tool calls."""
import json
from datetime import datetime, timezone
from pathlib import Path


def log_call(
    audit_file: Path,
    tool: str,
    args: dict,
    result: dict,
) -> None:
    """Append a tool call record to the audit log."""
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "tool": tool,
        "args": args,
        "ok": "error" not in result,
    }
    with open(audit_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")
```

Note: We log args but not full results (results can be large).
The `ok` flag is enough to spot failures. The audit file uses
JSON lines format for easy parsing.


### 3d: `kaisho/mcp/server.py`

The core MCP server. Uses FastMCP to register all allowed tools
and dispatch calls through the existing `execute_tool()`.

```python
"""Kaisho MCP server.

Exposes Kaisho tools via the Model Context Protocol (stdio).
Reuses the same execute_tool() dispatcher as the cron executor
and advisor, so tool behavior is identical.
"""
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
    # Set profile before loading config
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

    # Register each allowed tool as an MCP tool
    for tool_def in tools:
        _register_tool(mcp, tool_def, audit_file)

    return mcp


def _register_tool(
    mcp: FastMCP,
    tool_def: dict,
    audit_file: Path,
) -> None:
    """Register a single tool definition on the MCP
    server."""
    name = tool_def["name"]
    tier = tool_def.get("tier", "read")
    annotations = _TIER_ANNOTATIONS.get(tier, {})

    # Build the JSON schema for parameters
    schema = tool_def["input_schema"]
    props = schema.get("properties", {})
    required = schema.get("required", [])

    # Create a closure that captures the tool name
    # and dispatches through execute_tool()
    async def handler(
        _name=name, **kwargs,
    ) -> str:
        """Execute tool and return JSON result."""
        import json
        result = execute_tool(_name, kwargs)
        log_call(audit_file, _name, kwargs, result)
        if "error" in result:
            raise Exception(result["error"])
        return json.dumps(result, default=str)

    # FastMCP tool registration
    mcp.add_tool(
        handler,
        name=name,
        description=tool_def["description"],
        annotations=annotations,
    )


def run_server(
    profile: str | None = None,
    allow: str = "read",
) -> None:
    """Create and run the MCP server (stdio transport)."""
    server = create_server(profile=profile, allow=allow)
    server.run(transport="stdio")
```

Key design decisions:

1. **Direct service access.** The MCP server imports
   `execute_tool()` and calls it in-process, exactly like the
   cron executor. No HTTP round-trip to the FastAPI server.
   This means the MCP server is a standalone process that loads
   the backend directly.

2. **Profile via environment.** Setting `PROFILE` env before
   `get_config()` follows the existing pattern. The config
   singleton is reset to pick up the new value.

3. **Tool registration loop.** Each tool from `TOOL_DEFS` (after
   tier filtering) becomes an MCP tool. The handler closure
   captures the tool name and delegates to `execute_tool()`.

4. **Error handling.** `execute_tool()` never raises (returns
   `{"error": ...}`). The handler converts errors to exceptions
   so MCP clients see proper error responses.

5. **Annotations.** `readOnlyHint` and `destructiveHint` are set
   per tier so MCP clients (Claude Desktop, Claude Code) can
   display appropriate confirmation prompts.


## Step 4: Add CLI Command

File: `kaisho/cli/main.py`

Add a new Click command to the CLI group:

```python
@cli.command("mcp-server")
@click.option(
    "--profile", "-p",
    default=None,
    help="Profile to operate on (default: active).",
)
@click.option(
    "--allow", "-a",
    default="read",
    help=(
        "Allowed tiers: read, write, destructive. "
        "Comma-separated. write implies read. "
        "Default: read."
    ),
)
def mcp_server_cmd(profile, allow):
    """Start the MCP server (stdio transport)."""
    from ..mcp.server import run_server
    run_server(profile=profile, allow=allow)
```

Lazy import inside the function to avoid loading MCP
dependencies at CLI startup (only when actually starting the
MCP server).


## Step 5: Client Configuration

After implementation, users configure their MCP client to
launch the Kaisho server. No code changes needed for this step,
but the examples should go into `docs/mcp-evaluation.md` or a
new `docs/mcp-setup.md`.

### Claude Code (`~/.claude/mcp.json`)

```json
{
  "mcpServers": {
    "kaisho": {
      "command": "kai",
      "args": [
        "mcp-server",
        "--profile", "work",
        "--allow", "read,write"
      ]
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "kaisho": {
      "command": "kai",
      "args": [
        "mcp-server",
        "--profile", "work",
        "--allow", "read,write"
      ]
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)

Same format as Claude Code.

### Multiple profiles

Run separate server entries per profile:

```json
{
  "mcpServers": {
    "kaisho-work": {
      "command": "kai",
      "args": ["mcp-server", "-p", "work", "-a", "read,write"]
    },
    "kaisho-personal": {
      "command": "kai",
      "args": ["mcp-server", "-p", "personal", "-a", "read"]
    }
  }
}
```


## Step 6: Secrets Protection

No new code needed. The existing tool handlers in
`kaisho/cron/tools.py` never return API keys or credentials.
The settings service is not exposed as a tool.

Verify during implementation: grep all handler return values
in `tools.py` for any key/secret/password fields. There should
be none.


## Step 7: Testing

Add tests in `tests/test_mcp.py`:

```python
"""Tests for the MCP server module."""
import json
import pytest
from kaisho.mcp.tiers import filter_tools, parse_tiers
from kaisho.mcp.audit import log_call


def test_parse_tiers_read():
    assert parse_tiers("read") == {"read"}


def test_parse_tiers_write_implies_read():
    assert parse_tiers("write") == {"read", "write"}


def test_parse_tiers_destructive_implies_all():
    result = parse_tiers("destructive")
    assert result == {"read", "write", "destructive"}


def test_parse_tiers_ignores_invalid():
    assert parse_tiers("read,bogus") == {"read"}


def test_filter_tools_read_only():
    tools = filter_tools({"read"})
    for t in tools:
        assert t.get("tier", "read") == "read"


def test_filter_tools_includes_write():
    tools = filter_tools({"read", "write"})
    names = {t["name"] for t in tools}
    assert "list_tasks" in names
    assert "add_task" in names
    assert "delete_profile" not in names


def test_audit_log(tmp_path):
    log_file = tmp_path / "mcp-audit.log"
    log_call(log_file, "list_tasks", {}, {"tasks": []})
    lines = log_file.read_text().strip().split("\n")
    assert len(lines) == 1
    record = json.loads(lines[0])
    assert record["tool"] == "list_tasks"
    assert record["ok"] is True


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
```


## Implementation Order

1. **Add `tier` to `tool_defs.py`** (43 small edits, no logic
   change). Run existing tests to confirm nothing breaks.

2. **Add `fastmcp>=2.0` to `pyproject.toml`**. Run
   `pip install -e .` to install.

3. **Create `kaisho/mcp/` package** with `__init__.py`,
   `tiers.py`, `audit.py`, `server.py`.

4. **Add `mcp-server` command** to `kaisho/cli/main.py`.

5. **Add tests** in `tests/test_mcp.py`. Run `pytest`.

6. **Manual test**: run `kai mcp-server --allow read` and
   verify with an MCP client (Claude Code is easiest).

7. **Update CHANGELOG.md** with MCP server entry.


## What This Plan Does NOT Cover

- **MCP client** (Kaisho consuming external MCP servers).
  Per evaluation: YAGNI for now.
- **HTTP/SSE transport**. Only needed for remote access.
  Add later if requested.
- **OAuth 2.1**. Only needed with HTTP transport.
- **Dry-run mode**. Nice-to-have, not MVP. Can be added as
  `--dry-run` flag later (wrap `execute_tool` to log but skip
  the actual dispatch).
- **MCP resources** (exposing KB files as MCP resources rather
  than tools). Interesting for future, but tools are sufficient
  for MVP.
