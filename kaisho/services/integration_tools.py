"""Premium integration tools for the advisor (Pro).

The advisor runs a local agentic loop, but the premium
integrations (Linear, GitHub, Slack, Google Calendar) live
in Kaisho Cloud — their credentials and dispatch logic are
server-side. This module lets the advisor:

  * advertise the connected integrations' tools to the
    model (``advisor_integration_defs``), and
  * execute them by proxying to the cloud
    ``POST /integrations/dispatch`` endpoint
    (``dispatch_integration_tool``).

Tool names are namespaced (``linear_*`` etc.) and the specs
here mirror the cloud modules. Everything is best-effort:
if cloud sync is off / unreachable / on a non-Pro plan, no
integration tools are offered and dispatch returns an
error dict.
"""
import json
import urllib.error

from ..config import get_config
from . import cloud_sync as sync_svc
from . import settings as settings_svc

# Tool specs per integration kind, in the internal
# ``{name, description, input_schema}`` shape used by
# cron.tools (both the OpenAI and Anthropic projections
# derive from it). Mirrors the cloud modules' tools().
_S = "string"
INTEGRATION_DEFS: dict[str, list[dict]] = {
    "linear": [
        {
            "name": "linear_list_teams",
            "description": "List Linear teams (id + key).",
            "input_schema": {
                "type": "object", "properties": {},
            },
        },
        {
            "name": "linear_list_issues",
            "description": "List Linear issues, newest "
            "first. Optional text query and limit.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {"type": _S},
                    "limit": {"type": "integer"},
                },
            },
        },
        {
            "name": "linear_get_issue",
            "description": "Fetch one Linear issue by id.",
            "input_schema": {
                "type": "object",
                "properties": {"id": {"type": _S}},
                "required": ["id"],
            },
        },
        {
            "name": "linear_create_issue",
            "description": "Create a Linear issue in a team "
            "(team_id from linear_list_teams).",
            "input_schema": {
                "type": "object",
                "properties": {
                    "team_id": {"type": _S},
                    "title": {"type": _S},
                    "description": {"type": _S},
                },
                "required": ["team_id", "title"],
            },
        },
    ],
    "github": [
        {
            "name": "github_list_projects",
            "description": "List your GitHub Projects (v2).",
            "input_schema": {
                "type": "object",
                "properties": {"limit": {"type": "integer"}},
            },
        },
        {
            "name": "github_list_project_items",
            "description": "List items in a GitHub Project.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "project_id": {"type": _S},
                    "limit": {"type": "integer"},
                },
                "required": ["project_id"],
            },
        },
        {
            "name": "github_create_draft_item",
            "description": "Add a draft issue to a Project.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "project_id": {"type": _S},
                    "title": {"type": _S},
                    "body": {"type": _S},
                },
                "required": ["project_id", "title"],
            },
        },
    ],
    "slack": [
        {
            "name": "slack_list_channels",
            "description": "List public Slack channels.",
            "input_schema": {
                "type": "object",
                "properties": {"limit": {"type": "integer"}},
            },
        },
        {
            "name": "slack_search_messages",
            "description": "Search public-channel messages.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {"type": _S},
                    "limit": {"type": "integer"},
                },
                "required": ["query"],
            },
        },
        {
            "name": "slack_post_message",
            "description": "Post a message to a channel "
            "(id from slack_list_channels).",
            "input_schema": {
                "type": "object",
                "properties": {
                    "channel": {"type": _S},
                    "text": {"type": _S},
                },
                "required": ["channel", "text"],
            },
        },
    ],
    "google": [
        {
            "name": "google_list_events",
            "description": "List upcoming primary-calendar "
            "events. ISO-8601 from/to bound the window.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "from": {"type": _S},
                    "to": {"type": _S},
                    "limit": {"type": "integer"},
                },
            },
        },
        {
            "name": "google_freebusy",
            "description": "Busy intervals between from and "
            "to (ISO-8601, both required).",
            "input_schema": {
                "type": "object",
                "properties": {
                    "from": {"type": _S},
                    "to": {"type": _S},
                },
                "required": ["from", "to"],
            },
        },
        {
            "name": "google_create_event",
            "description": "Create a primary-calendar event "
            "(start/end ISO-8601 date-times).",
            "input_schema": {
                "type": "object",
                "properties": {
                    "summary": {"type": _S},
                    "start": {"type": _S},
                    "end": {"type": _S},
                    "description": {"type": _S},
                },
                "required": ["summary", "start", "end"],
            },
        },
    ],
}

# tool name -> integration kind
_TOOL_KIND: dict[str, str] = {
    tool["name"]: kind
    for kind, tools in INTEGRATION_DEFS.items()
    for tool in tools
}


def _cloud_creds() -> tuple[str, str] | None:
    """(url, api_key) if cloud sync is enabled + keyed."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    sync = data.get("cloud_sync", {})
    url = sync.get("url", "")
    key = sync.get("api_key", "")
    if not sync.get("enabled") or not url or not key:
        return None
    return url.rstrip("/"), key


def is_integration_tool(name: str) -> bool:
    """Whether ``name`` is a premium-integration tool."""
    return name in _TOOL_KIND


def connected_kinds() -> list[str]:
    """Integration kinds the user has connected (cloud).

    Best-effort: empty on no cloud / unreachable / non-Pro.
    """
    creds = _cloud_creds()
    if creds is None:
        return []
    url, key = creds
    try:
        rows = sync_svc.safe_request(
            f"{url}/integrations", key, "GET",
        )
    except sync_svc.CloudUnavailable:
        return []
    if not isinstance(rows, list):
        return []
    return [r.get("kind") for r in rows if r.get("kind")]


# Integrations whose cloud tools are hidden from the
# advisor on the desktop:
#
#   - ``github``  the desktop already has local GitHub
#                 tools (issues / PRs / projects); exposing
#                 the cloud ``github_*`` tools too would
#                 give the model two overlapping GitHub
#                 surfaces.
#   - ``google``  ``list_calendar_events`` already covers
#                 BOTH CalDAV and Google (it fans out via
#                 calendar_aggregator). Without this
#                 exclusion the model picks the more
#                 narrowly-named ``google_list_events`` and
#                 reports "no events" for users whose
#                 calendar lives in iCloud / Fastmail /
#                 Nextcloud CalDAV. Reported by user
#                 2026-05-31.
#
# The cloud google_* / github_* tools stay registered for
# cloud-only consumers (PWA, external MCP).
_DESKTOP_EXCLUDED_KINDS = {"github", "google"}


def advisor_integration_defs() -> list[dict]:
    """Tool defs (internal shape) for connected
    integrations, to append to the advisor toolbox.

    Excludes integrations that already have a local tool
    equivalent on the desktop (GitHub) to avoid handing the
    model two overlapping surfaces."""
    out: list[dict] = []
    for kind in connected_kinds():
        if kind in _DESKTOP_EXCLUDED_KINDS:
            continue
        out.extend(INTEGRATION_DEFS.get(kind, []))
    return out


def dispatch_integration_tool(name: str, args: dict) -> dict:
    """Run an integration tool via the cloud dispatch
    endpoint. Returns the result dict, or {"error": ...}."""
    kind = _TOOL_KIND.get(name)
    if kind is None:
        return {"error": f"unknown integration tool: {name}"}
    creds = _cloud_creds()
    if creds is None:
        return {"error": "Cloud sync is not connected"}
    url, key = creds
    try:
        resp = sync_svc.http_request(
            f"{url}/integrations/dispatch", key, "POST",
            {"kind": kind, "tool": name, "args": args or {}},
        )
        return {"result": (resp or {}).get("result")}
    except urllib.error.HTTPError as exc:
        detail = "dispatch failed"
        try:
            body = json.loads(exc.read().decode("utf-8"))
            detail = body.get("error") or detail
        except (ValueError, OSError):
            pass
        return {"error": detail}
    except (urllib.error.URLError, OSError):
        return {"error": "Cloud unreachable"}
