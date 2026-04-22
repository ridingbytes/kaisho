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
