"""Tool dispatcher for the agentic executor.

Tool definitions live in ``tool_defs.py``.
``openai_tools()`` converts them to the OpenAI / Ollama chat format.
``execute_tool(name, args)`` dispatches a tool call to the backend.
"""
import json
import re
from pathlib import Path
from typing import Any

from . import guards
from .tool_defs import TOOL_DEFS

# Slug pattern for cron job ids and any user-supplied
# string that ends up in a filesystem path. Lowercase
# alphanumerics + dashes, must start with alphanumeric,
# 1-64 chars. Strict to avoid path traversal and to keep
# YAML / URL / disk paths sane.
_JOB_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


def _validate_job_id(job_id: str) -> str | None:
    """Return an error message if job_id is unsafe, else
    None. Tightens to a slug shape so the value is safe
    to use as a filename, in URLs, and in YAML."""
    if not isinstance(job_id, str) or not job_id:
        return "job_id is required"
    if not _JOB_ID_RE.match(job_id):
        return (
            "Invalid job_id: must be lowercase "
            "alphanumeric with dashes, 1-64 chars, "
            "start with a letter or digit"
        )
    return None


def _write_user_prompt(
    cfg, job_id: str, content: str,
) -> Path:
    """Write a user-created prompt to the profile dir.

    Returns the absolute path written. Uses the profile
    dir (not the runtime install dir) so the prompt
    survives Kaisho version updates.
    """
    prompts_dir = cfg.PROFILE_DIR / "prompts"
    prompts_dir.mkdir(parents=True, exist_ok=True)
    prompt_path = prompts_dir / f"{job_id}.md"
    prompt_path.write_text(content, encoding="utf-8")
    return prompt_path


def _coerce_tags(value: Any) -> list[str] | None:
    """Normalize a ``tags`` argument coming from a tool
    call into ``list[str] | None``.

    LLMs and MCP clients sometimes pass a single string
    where the schema declares an array (e.g.
    ``tags="@github"`` or ``tags="@github, @code"``).
    Without this, the downstream backend treats the
    string as an iterable and stores each character as
    a separate tag. Empty/whitespace input becomes
    ``None`` so the backend's "no change" path runs.

    :param value: The raw ``tags`` argument.
    :returns: A list of tag names, or ``None`` if no tags
        were supplied.
    """
    if value is None:
        return None
    if isinstance(value, list):
        cleaned = [
            str(t).strip() for t in value
            if str(t).strip()
        ]
        return cleaned or None
    if isinstance(value, str):
        parts = [
            p.strip() for p in value.split(",")
            if p.strip()
        ]
        return parts or None
    return None


def openai_tools() -> list[dict]:
    """Return tool definitions in OpenAI / Ollama chat format."""
    return _to_openai_tools(TOOL_DEFS)


def advisor_safe_tool_defs() -> list[dict]:
    """Return tool defs the advisor is allowed to call.

    The advisor runs in front of the user but is exposed
    to prompt-injection vectors (URLs the user pastes in,
    KB files fetched as context, etc.). To bound the
    blast radius we hand it ``tier=read`` and
    ``tier=write`` tools but never ``tier=destructive``
    ones -- a hostile prompt can't talk the model into
    calling ``delete_*`` or ``rename_profile`` if those
    functions are not in the toolbox in the first place.

    Pair this with the per-session caps in
    :mod:`.guards` and the size/overwrite checks in
    :func:`_write_kb_file` for defence in depth.
    """
    return [
        {
            "name": t["name"],
            "description": t["description"],
            "input_schema": t["input_schema"],
        }
        for t in TOOL_DEFS
        if t.get("tier", "read") in ("read", "write")
    ]


def advisor_safe_tools() -> list[dict]:
    """Advisor-safe tools in OpenAI / Ollama chat shape."""
    return _to_openai_tools(advisor_safe_tool_defs())


def cron_safe_tool_defs() -> list[dict]:
    """Return cron-safe tool defs in Anthropic schema
    shape: ``{name, description, input_schema}``.

    Cron runs unattended. Even with the Kaisho Context
    block pre-injected, an agentic prompt can decide to
    call tools — and the prompt body may include text
    fetched from third-party URLs (HN, GitHub, etc.) that
    can carry prompt-injection payloads. To bound the
    blast radius we hand cron only ``tier=read`` tools:
    inspection, research, and external fetches. No
    deletes, no CLI, no profile management, no scheduled
    work. Cron's own output gets written to inbox via
    write_output, not via tools.

    The internal ``tier`` field is stripped so the result
    is a strict-conforming Anthropic ``tools`` payload —
    Anthropic ignores unknown keys today but the contract
    is brittle and worth keeping clean.

    Used directly by run_prompt_claude. Wrap with
    cron_safe_tools() for OpenAI/Ollama shape.
    """
    return [
        {
            "name": t["name"],
            "description": t["description"],
            "input_schema": t["input_schema"],
        }
        for t in TOOL_DEFS
        if t.get("tier", "read") == "read"
    ]


def cron_safe_tools() -> list[dict]:
    """Cron-safe tools in OpenAI / Ollama chat shape."""
    return _to_openai_tools(cron_safe_tool_defs())


def _to_openai_tools(defs: list[dict]) -> list[dict]:
    """Project an internal tool list to OpenAI/Ollama
    chat-completions ``tools`` shape."""
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["input_schema"],
            },
        }
        for t in defs
    ]


# -------------------------------------------------------------------
# Tool dispatcher
# -------------------------------------------------------------------

def execute_tool(name: str, args: Any) -> dict:
    """Execute a tool call and return a result dict.

    ``args`` may be a dict or a JSON string (Ollama sends strings).
    Never raises -- errors are returned as {"error": "..."}.

    Before dispatch every non-read tool goes through the
    shared :mod:`.guards` so cron and advisor share one
    set of defences:

    * Per-session **write cap** (and a separate, tighter
      cap for ``write_kb_file``).
    * **Auto-snapshot** of the profile directory the
      first time a session attempts a write, throttled
      across the process so we don't spam backups.

    Callers must invoke :func:`guards.reset_session` at
    the start of each agentic run (already wired in cron
    and advisor) so counters don't leak between runs on a
    re-used worker thread.
    """
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except json.JSONDecodeError:
            return {"error": f"invalid JSON args: {args!r}"}
    if not isinstance(args, dict):
        args = {}

    tier = _tool_tier(name)
    cap_err = guards.check_caps(name, tier)
    if cap_err is not None:
        return cap_err
    guards.maybe_auto_snapshot(name, tier)

    try:
        return _dispatch(name, args)
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


_TIER_BY_NAME: dict[str, str] = {
    t["name"]: t.get("tier", "read") for t in TOOL_DEFS
}


def _tool_tier(name: str) -> str:
    """Look up the declared tier for a tool name.

    Unknown tools are treated as ``read`` (the safest
    default for the caps; ``_dispatch`` will reject them
    on its own).
    """
    return _TIER_BY_NAME.get(name, "read")


# -------------------------------------------------------------------
# Handler functions (each accepts args: dict, returns dict)
# -------------------------------------------------------------------

def _backend():
    from ..backends import get_backend
    return get_backend()


def _list_tasks(args: dict) -> dict:
    tasks = _backend().tasks.list_tasks(
        customer=args.get("customer"),
        status=(
            [args["status"]] if args.get("status") else None
        ),
        include_done=args.get("include_done", False),
    )
    return {"tasks": tasks}


def _add_task(args: dict) -> dict:
    backend = _backend()
    backend.customers.ensure_customer(args.get("customer", ""))
    task = backend.tasks.add_task(
        customer=args.get("customer", ""),
        title=args["title"],
        status=args.get("status", "TODO"),
        tags=_coerce_tags(args.get("tags")),
        body=args.get("body"),
        github_url=args.get("github_url"),
    )
    return {"task": task}


def _move_task(args: dict) -> dict:
    task = _backend().tasks.move_task(
        task_id=args["task_id"],
        new_status=args["status"],
    )
    return {"task": task}


def _list_inbox(args: dict) -> dict:
    items = _backend().inbox.list_items()
    if args.get("item_type"):
        items = [
            i for i in items
            if (i.get("type") or "").upper()
            == args["item_type"].upper()
        ]
    return {"items": items}


def _add_inbox_item(args: dict) -> dict:
    backend = _backend()
    backend.customers.ensure_customer(args.get("customer") or "")
    item = backend.inbox.add_item(
        text=args["text"],
        item_type=args.get("item_type"),
        customer=args.get("customer"),
        body=args.get("body"),
    )
    return {"item": item}


def _list_clock_entries(args: dict) -> dict:
    entries = _backend().clocks.list_entries(
        period=args.get("period", "week"),
    )
    return {"entries": entries}


def _book_time(args: dict) -> dict:
    backend = _backend()
    backend.customers.ensure_customer(args.get("customer", ""))
    entry = backend.clocks.quick_book(
        duration_str=args["duration"],
        customer=args.get("customer", ""),
        description=args.get("description", ""),
        contract=args.get("contract"),
        task_id=args.get("task_id"),
        notes=args.get("notes"),
        start_time=args.get("start"),
    )
    return {"entry": entry}


def _list_customers(args: dict) -> dict:
    return {
        "customers": _backend().customers.list_customers(),
    }


def _list_contracts(args: dict) -> dict:
    contracts = _backend().customers.list_contracts(
        args["customer"],
    )
    return {"contracts": contracts}


def _delete_customer(args: dict) -> dict:
    ok = _backend().customers.delete_customer(
        args["customer"],
    )
    if not ok:
        return {"error": "Customer not found"}
    return {"deleted": args["customer"]}


def _list_notes(args: dict) -> dict:
    return {"notes": _backend().notes.list_notes()}


def _add_note(args: dict) -> dict:
    backend = _backend()
    backend.customers.ensure_customer(args.get("customer") or "")
    note = backend.notes.add_note(
        title=args["title"],
        body=args.get("body", ""),
        customer=args.get("customer"),
    )
    return {"note": note}


def _set_task_tags(args: dict) -> dict:
    task = _backend().tasks.set_tags(
        args["task_id"],
        _coerce_tags(args.get("tags")) or [],
    )
    return {"task": task}


def _archive_task(args: dict) -> dict:
    ok = _backend().tasks.archive_task(args["task_id"])
    return {"archived": ok}


def _update_task(args: dict) -> dict:
    task = _backend().tasks.update_task(
        task_id=args["task_id"],
        title=args.get("title"),
        customer=args.get("customer"),
        body=args.get("body"),
        github_url=args.get("github_url"),
    )
    return {"task": task}


def _delete_note(args: dict) -> dict:
    ok = _backend().notes.delete_note(args["note_id"])
    return {"deleted": ok}


def _update_note(args: dict) -> dict:
    updates = {
        k: args[k] for k in ("title", "body")
        if k in args
    }
    if "tags" in args:
        updates["tags"] = _coerce_tags(args["tags"]) or []
    note = _backend().notes.update_note(
        args["note_id"], updates,
    )
    return {"note": note}


def _start_clock(args: dict) -> dict:
    entry = _backend().clocks.start(
        customer=args.get("customer", ""),
        description=args.get("description", ""),
        task_id=args.get("task_id"),
        contract=args.get("contract"),
    )
    return {"entry": entry}


def _stop_clock(args: dict) -> dict:
    return {"entry": _backend().clocks.stop()}


def _update_clock_entry(args: dict) -> dict:
    sync_id = args.get("sync_id")
    start_iso = args.get("start")
    if not sync_id and not start_iso:
        return {
            "error": "sync_id or start is required",
        }

    new_date = None
    start_time = None
    hours = None
    new_start = args.get("new_start")
    new_end = args.get("new_end")
    if new_start:
        from datetime import datetime
        ns = datetime.fromisoformat(new_start)
        new_date = ns.date()
        start_time = ns.strftime("%H:%M")
        if new_end:
            ne = datetime.fromisoformat(new_end)
            hours = (ne - ns).total_seconds() / 3600
    elif new_end:
        return {
            "error": "new_end requires new_start",
        }

    result = _backend().clocks.update_entry(
        sync_id=sync_id,
        start_iso=start_iso,
        customer=args.get("customer"),
        description=args.get("description"),
        invoiced=args.get("invoiced"),
        contract=args.get("contract"),
        notes=args.get("notes"),
        task_id=args.get("task_id"),
        new_date=new_date,
        start_time=start_time,
        hours=hours,
    )
    if result is None:
        return {"error": "Entry not found"}
    return {"entry": result}


def _delete_clock_entry(args: dict) -> dict:
    from ..services import cloud_sync as sync_svc
    sync_id = args.get("sync_id")
    start_iso = args.get("start")
    if not sync_id and not start_iso:
        return {
            "error": "sync_id or start is required",
        }
    entry = _backend().clocks.delete_entry(
        sync_id=sync_id,
        start_iso=start_iso,
    )
    if entry is None:
        return {"error": "Entry not found"}
    sync_svc.on_local_delete(entry)
    return {
        "deleted": True,
        "sync_id": entry.get("sync_id"),
        "start": entry.get("start"),
    }


def _delete_task(args: dict) -> dict:
    """Remove a task from the active board.

    The backend already routes archived tasks out of
    list_tasks, so this is the user-facing delete.
    """
    ok = _backend().tasks.archive_task(args["task_id"])
    if not ok:
        return {"error": "Task not found"}
    return {"deleted": True, "task_id": args["task_id"]}


def _batch_invoice(args: dict) -> dict:
    """Mark all uninvoiced entries for a contract."""
    customer = args.get("customer")
    contract = args.get("contract")
    entries = _backend().clocks.list_entries(
        period="year",
        customer=customer,
        contract=contract,
    )
    count = 0
    for e in entries:
        if e.get("invoiced"):
            continue
        _backend().clocks.update_entry(
            start_iso=e["start"], invoiced=True,
        )
        count += 1
    return {"invoiced": count}


def _string_user_fields() -> tuple[str, ...]:
    """All ``user.<field>`` names that map to plain
    strings, derived from the canonical USER_FIELDS list
    in placeholders. ``research_targets`` is the only
    list-valued field and is handled separately.
    """
    from ..services.placeholders import USER_FIELDS
    return tuple(
        f for f in USER_FIELDS if f != "research_targets"
    )


def _get_user_profile(args: dict) -> dict:
    """Return user.yaml fields for the active profile.

    Values are surfaced for the advisor / onboarding flow.
    They are substituted into prompt text only — no path
    or shell context — so arbitrary user input is safe to
    persist verbatim.
    """
    from ..config import get_config, load_user_yaml
    cfg = get_config()
    data = load_user_yaml(cfg)
    out: dict = {"profile": cfg.PROFILE}
    for field in _string_user_fields():
        out[field] = data.get(field, "")
    out["research_targets"] = list(
        data.get("research_targets") or []
    )
    return out


def _normalize_research_targets(value) -> list[str] | str:
    """Return a cleaned list of targets, or an error
    message string. Accepts a list of strings or a
    newline-separated single string (LLMs sometimes
    collapse arrays into strings)."""
    if isinstance(value, str):
        value = value.splitlines()
    if not isinstance(value, list):
        return "research_targets must be a list of strings"
    return [
        str(t).strip() for t in value if str(t).strip()
    ]


def _update_user_profile(args: dict) -> dict:
    """Patch user.yaml fields for the active profile.

    Only keys present in ``args`` are written; unspecified
    keys are preserved. Non-string scalar values are
    rejected to prevent accidental ``str(dict)`` coercion
    when a model emits the wrong shape.
    """
    from ..config import (
        get_config, load_user_yaml, save_user_yaml,
    )
    cfg = get_config()
    data = load_user_yaml(cfg)
    written: list[str] = []
    for field in _string_user_fields():
        if field not in args or args[field] is None:
            continue
        value = args[field]
        if not isinstance(value, str):
            return {
                "error": (
                    f"{field} must be a string, got "
                    f"{type(value).__name__}"
                ),
            }
        data[field] = value
        written.append(field)
    if "research_targets" in args:
        normalized = _normalize_research_targets(
            args["research_targets"],
        )
        if isinstance(normalized, str):
            return {"error": normalized}
        data["research_targets"] = normalized
        written.append("research_targets")
    save_user_yaml(cfg, data)
    return {
        "updated": written,
        "profile": _get_user_profile({}),
    }


def _list_profiles(args: dict) -> dict:
    from ..config import get_config, list_profiles
    cfg = get_config()
    return {
        "active": cfg.PROFILE,
        "profiles": list_profiles(cfg),
    }


def _rename_profile(args: dict) -> dict:
    from ..config import rename_profile
    try:
        rename_profile(args["old_name"], args["new_name"])
        return {
            "renamed": True,
            "old_name": args["old_name"],
            "new_name": args["new_name"],
        }
    except ValueError as exc:
        return {"error": str(exc)}


def _delete_profile(args: dict) -> dict:
    from ..config import delete_profile
    try:
        delete_profile(args["name"])
        return {"deleted": True, "name": args["name"]}
    except ValueError as exc:
        return {"error": str(exc)}


# -------------------------------------------------------------------
# Dispatch table
# -------------------------------------------------------------------

_HANDLERS: dict[str, Any] = {
    "list_tasks": _list_tasks,
    "add_task": _add_task,
    "move_task": _move_task,
    "list_inbox": _list_inbox,
    "add_inbox_item": _add_inbox_item,
    "list_clock_entries": _list_clock_entries,
    "book_time": _book_time,
    "list_customers": _list_customers,
    "list_contracts": _list_contracts,
    "delete_customer": _delete_customer,
    "search_knowledge": lambda a: _search_knowledge(
        a["query"], a.get("max_results", 10),
    ),
    "read_knowledge_file": lambda a: _read_knowledge_file(
        a["path"],
    ),
    "transcribe_youtube": lambda a: _transcribe_youtube(
        a["url"], a.get("languages", "en,de"),
    ),
    "list_notes": _list_notes,
    "add_note": _add_note,
    "set_task_tags": _set_task_tags,
    "archive_task": _archive_task,
    "update_task": _update_task,
    "delete_note": _delete_note,
    "update_note": _update_note,
    "start_clock": _start_clock,
    "stop_clock": _stop_clock,
    "update_clock_entry": _update_clock_entry,
    "delete_clock_entry": _delete_clock_entry,
    "delete_task": _delete_task,
    "batch_invoice": _batch_invoice,
    "list_kb_files": lambda a: _list_kb_files(),
    "list_profiles": _list_profiles,
    "get_user_profile": _get_user_profile,
    "update_user_profile": _update_user_profile,
    "rename_profile": _rename_profile,
    "delete_profile": _delete_profile,
    "create_skill": lambda a: _create_skill(
        a["name"], a["content"],
    ),
    "write_kb_file": lambda a: _write_kb_file(
        a["label"], a["filename"], a["content"],
        overwrite=bool(a.get("overwrite", False)),
    ),
    "web_search": lambda a: _web_search(
        a["query"], a.get("max_results", 5),
    ),
    "fetch_url": lambda a: _fetch_url(
        a["url"], a.get("accept", ""),
    ),
    "approve_url_domain": lambda a: _approve_url_domain(
        a["domain"],
    ),
    "list_github_projects": lambda a: _list_github_projects(
        customer=a.get("customer"),
        status_filter=a.get("status"),
        include_closed=a.get("include_closed", False),
    ),
    "list_github_issues": lambda a: _list_github_issues(
        customer=a.get("customer"),
    ),
    "execute_cli": lambda a: _execute_cli(
        a.get("command", ""),
    ),
    "get_time_insights": lambda a: _get_time_insights(
        a.get("period", "month"),
    ),
    "list_cron_jobs": lambda a: _list_cron_jobs(),
    "list_cron_templates": (
        lambda a: _list_cron_templates()
    ),
    "create_cron_from_template": lambda a: (
        _create_cron_from_template(
            template_id=a["template_id"],
            job_id=a["job_id"],
            name=a.get("name"),
            schedule=a.get("schedule"),
            enabled=a.get("enabled", False),
        )
    ),
    "trigger_cron_job": lambda a: _trigger_cron_job(
        a["job_id"],
    ),
    "create_backup": lambda a: _create_backup(
        prune=a.get("prune", True),
    ),
    "list_backups": lambda a: _list_backups(),
}


def _dispatch(name: str, args: dict) -> dict:
    handler = _HANDLERS.get(name)
    if handler is None:
        return {"error": f"unknown tool: {name!r}"}
    return handler(args)


# -------------------------------------------------------------------
# Internal helpers
# -------------------------------------------------------------------

def _transcribe_youtube(url: str, languages: str = "en,de") -> dict:
    from ..services.youtube import transcribe
    langs = [c.strip() for c in languages.split(",") if c.strip()]
    try:
        return transcribe(url, languages=langs)
    except (OSError, ValueError) as exc:
        return {"error": str(exc)}


def _create_skill(name: str, content: str) -> dict:
    from pathlib import Path
    from ..config import get_config
    from ..services.advisor import save_skill
    cfg = get_config()
    data_dir = Path(str(cfg.DATA_DIR.expanduser()))
    return {"skill": save_skill(data_dir, name, content)}


def _extract_domain(url: str) -> str:
    from urllib.parse import urlparse
    return urlparse(url).hostname or ""


def _is_domain_allowed(domain: str) -> bool:
    from ..config import get_config
    from ..services.settings import (
        get_url_allowlist, load_settings,
    )
    cfg = get_config()
    data = load_settings(cfg.SETTINGS_FILE)
    return domain in get_url_allowlist(data)


def _rewrite_pypi_url(url: str) -> str | None:
    """Rewrite PyPI project URLs to use the JSON API.

    PyPI serves a JS-rendered page that returns no content
    for simple HTTP clients. The JSON API returns the full
    package description as plain text.
    """
    import re
    m = re.match(
        r"https?://pypi\.org/project/([^/]+)/?",
        url,
    )
    if m:
        return (
            f"https://pypi.org/pypi/{m.group(1)}/json"
        )
    return None


def _fetch_pypi(url: str) -> dict:
    """Fetch package info via the PyPI JSON API."""
    import urllib.request
    req = urllib.request.Request(url, headers={
        "User-Agent": "kaisho/1.0",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        import json as _json
        data = _json.loads(resp.read())
    info = data.get("info", {})
    body = info.get("description", "")
    summary = info.get("summary", "")
    name = info.get("name", "")
    header = f"# {name}\n\n{summary}\n\n" if name else ""
    return {
        "body": header + body,
        "truncated": len(body) > 50_000,
    }


def _fetch_url(url: str, accept: str = "") -> dict:
    """Fetch a URL (must be in allowlist, truncated to 50k)."""
    import urllib.request
    if not url.startswith(("http://", "https://")):
        return {"error": "only http/https URLs are supported"}

    # PyPI project pages are JS-rendered; use JSON API
    pypi_url = _rewrite_pypi_url(url)
    if pypi_url:
        try:
            return _fetch_pypi(pypi_url)
        except (OSError, ValueError) as exc:
            return {"error": str(exc)}

    domain = _extract_domain(url)
    if not _is_domain_allowed(domain):
        return {
            "pending_approval": True,
            "domain": domain, "url": url,
        }
    headers = {"User-Agent": "kaisho/1.0"}
    if accept:
        headers["Accept"] = accept
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read(50_000)
            charset = (
                resp.headers.get_content_charset() or "utf-8"
            )
            body = raw.decode(charset, errors="replace")
            truncated = len(raw) >= 50_000
    except (OSError, ValueError) as exc:
        return {"error": str(exc)}
    return {"body": body, "truncated": truncated}


def _approve_url_domain(domain: str) -> dict:
    from ..config import get_config
    from ..services.settings import add_to_url_allowlist
    cfg = get_config()
    return {
        "allowlist": add_to_url_allowlist(
            cfg.SETTINGS_FILE, domain,
        ),
    }


def _kb_sources() -> list[dict]:
    from ..config import get_config
    from ..services.settings import (
        get_kb_sources, load_settings,
    )
    cfg = get_config()
    return get_kb_sources(load_settings(cfg.SETTINGS_FILE), cfg)


def _list_kb_files() -> dict:
    from ..services import knowledge as kb_svc
    return {"files": kb_svc.file_tree(_kb_sources())}


_KB_WRITE_MAX_BYTES = 1_000_000


def _write_kb_file(
    label: str, filename: str, content: str,
    overwrite: bool = False,
) -> dict:
    """Write a file to the knowledge base.

    Two safety rails on top of
    :func:`kaisho.services.knowledge.write_file`:

    * Refuse content larger than ``_KB_WRITE_MAX_BYTES``
      so a runaway model can't dump megabytes of repeated
      tokens onto disk.
    * Refuse to clobber an existing file unless the caller
      explicitly passes ``overwrite=True``. The error
      message tells the model how to retry, so a
      legitimate update path stays available -- the rail
      is against silent overwrites the user never asked
      for.
    """
    from ..services import knowledge as kb_svc
    if not isinstance(content, str):
        content = str(content)
    size = len(content.encode("utf-8"))
    if size > _KB_WRITE_MAX_BYTES:
        return {
            "error": (
                f"KB write rejected: payload is {size} "
                f"bytes, limit is {_KB_WRITE_MAX_BYTES}."
            ),
        }
    # ``resolve_path`` only does a filesystem ``exists``
    # check -- crucially it does NOT decode PDFs or run
    # any extractor, unlike ``read_file``. This keeps the
    # overwrite probe O(1).
    existing = kb_svc.resolve_path(_kb_sources(), filename)
    if existing is not None and not overwrite:
        return {
            "error": (
                "File already exists. Pass "
                "overwrite=true to replace it, or "
                "choose a different filename."
            ),
        }
    return {
        "file": kb_svc.write_file(
            _kb_sources(), label, filename, content,
        ),
        "overwritten": existing is not None,
    }


def _get_search_keys() -> dict[str, str]:
    """Load search API keys from AI settings."""
    from ..config import get_config
    from ..services.settings import (
        get_ai_settings, load_settings,
    )
    cfg = get_config()
    ai = get_ai_settings(load_settings(cfg.SETTINGS_FILE))
    return {
        "brave": ai.get("brave_api_key", ""),
        "tavily": ai.get("tavily_api_key", ""),
    }


def _search_brave(
    query: str, api_key: str, max_results: int,
) -> dict:
    """Search via Brave Search API."""
    import urllib.parse
    import urllib.request
    url = (
        "https://api.search.brave.com/res/v1/web/search?"
        + urllib.parse.urlencode({
            "q": query, "count": max_results,
        })
    )
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": api_key,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        import gzip
        raw = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        data = json.loads(raw)
    results = []
    for item in (data.get("web", {}).get("results") or []):
        results.append({
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "snippet": item.get("description", ""),
        })
        if len(results) >= max_results:
            break
    return {"results": results, "provider": "brave"}


def _search_tavily(
    query: str, api_key: str, max_results: int,
) -> dict:
    """Search via Tavily Search API."""
    import urllib.request
    payload = json.dumps({
        "query": query,
        "max_results": max_results,
        "include_answer": False,
    }).encode()
    req = urllib.request.Request(
        "https://api.tavily.com/search",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    results = []
    for item in (data.get("results") or []):
        results.append({
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "snippet": item.get("content", ""),
        })
        if len(results) >= max_results:
            break
    return {"results": results, "provider": "tavily"}


def _search_duckduckgo(
    query: str, max_results: int,
) -> dict:
    """Fallback: scrape DuckDuckGo HTML results."""
    import re
    import urllib.parse
    import urllib.request
    url = (
        "https://html.duckduckgo.com/html/?q="
        + urllib.parse.quote_plus(query)
    )
    req = urllib.request.Request(url, headers={
        "User-Agent": (
            "Mozilla/5.0 (compatible; kaisho/1.0)"
        ),
    })
    with urllib.request.urlopen(
        req, timeout=15,
    ) as resp:
        html = resp.read(200_000).decode(
            "utf-8", errors="replace",
        )

    results = []
    for m in re.finditer(
        r'<a rel="nofollow" class="result__a"'
        r' href="([^"]+)"[^>]*>(.*?)</a>',
        html,
    ):
        href = m.group(1)
        title = re.sub(
            r"<[^>]+>", "", m.group(2),
        ).strip()
        if not title or "duckduckgo" in href.lower():
            continue
        results.append({"title": title, "url": href})
        if len(results) >= max_results:
            break

    snippet_blocks = re.findall(
        r'<a class="result__snippet"[^>]*>(.*?)</a>',
        html,
    )
    for i, snip in enumerate(snippet_blocks):
        if i < len(results):
            results[i]["snippet"] = re.sub(
                r"<[^>]+>", "", snip,
            ).strip()

    return {"results": results, "provider": "duckduckgo"}


def _web_search(query: str, max_results: int = 5) -> dict:
    """Search the web using the best available provider.

    Priority: Brave > Tavily > DuckDuckGo (fallback).
    """
    keys = _get_search_keys()

    providers = []
    if keys["brave"]:
        providers.append(
            lambda: _search_brave(
                query, keys["brave"], max_results,
            )
        )
    if keys["tavily"]:
        providers.append(
            lambda: _search_tavily(
                query, keys["tavily"], max_results,
            )
        )
    providers.append(
        lambda: _search_duckduckgo(query, max_results)
    )

    last_error = ""
    for search_fn in providers:
        try:
            return search_fn()
        except (OSError, ValueError) as exc:
            last_error = str(exc)
    return {"error": f"All search providers failed: {last_error}"}


def _search_knowledge(query: str, max_results: int = 10) -> dict:
    from ..services import knowledge as kb_svc
    return {
        "results": kb_svc.search(
            _kb_sources(), query, max_results=max_results,
        ),
    }


def _read_knowledge_file(path: str) -> dict:
    from ..services import knowledge as kb_svc
    content = kb_svc.read_file(_kb_sources(), path)
    if content is None:
        return {"error": f"File not found: {path}"}
    is_pdf = path.lower().endswith(".pdf")
    limit = 8_000 if is_pdf else 30_000
    if len(content) > limit:
        content = (
            content[:limit]
            + "\n...(truncated — use search_knowledge"
            + " to find specific sections)"
        )
    return {"content": content}


def _format_project_item(item: dict) -> dict:
    return {
        "number": item.get("number"),
        "title": item.get("title"),
        "type": item.get("type"),
        "url": item.get("url"),
        "labels": item.get("labels", []),
    }


def _format_project(proj: dict, repo: str,
                    status_filter: str | None) -> dict:
    items = proj.get("items", [])
    if status_filter:
        sf = status_filter.lower()
        items = [
            i for i in items
            if (i.get("status") or "").lower() == sf
        ]
    status_order = proj.get("status_order", [])
    by_status: dict[str, list[dict]] = {}
    for item in items:
        key = item.get("status") or "(no status)"
        by_status.setdefault(key, []).append(item)
    ordered = [
        s for s in status_order if s in by_status
    ] + [s for s in by_status if s not in status_order]
    return {
        "title": proj.get("title"),
        "url": proj.get("url"),
        "closed": proj.get("closed", False),
        "repo": repo,
        "columns": [
            {"status": s, "items": [
                _format_project_item(i)
                for i in by_status[s]
            ]}
            for s in ordered
        ],
    }


def _filter_by_customer(groups, customer):
    if not customer:
        return groups
    lc = customer.lower()
    return [
        g for g in groups if g["customer"].lower() == lc
    ]


def _list_github_projects(
    customer: str | None = None,
    status_filter: str | None = None,
    include_closed: bool = False,
) -> dict:
    from ..services.github import (
        GhError, projects_for_customers,
    )
    try:
        groups = projects_for_customers(
            _backend().customers.list_customers(),
        )
    except GhError as exc:
        return {"error": str(exc)}
    result = []
    for group in _filter_by_customer(groups, customer):
        projects = group["projects"]
        if not include_closed:
            projects = [
                p for p in projects if not p.get("closed")
            ]
        result.append({
            "customer": group["customer"],
            "repo": group["repo"],
            "projects": [
                _format_project(p, group["repo"],
                                status_filter)
                for p in projects
            ],
        })
    return {"groups": result}


def _list_github_issues(customer: str | None = None) -> dict:
    from ..services.github import (
        GhError, issues_for_customers,
    )
    try:
        groups = issues_for_customers(
            _backend().customers.list_customers(),
        )
    except GhError as exc:
        return {"error": str(exc)}
    return {
        "groups": _filter_by_customer(groups, customer),
    }


# Commands blocked from execute_cli (destructive or
# irrelevant in an agentic context).
_CLI_BLOCKED = {
    "serve", "mcp-server", "profiles", "config",
    "convert",
}


def _execute_cli(command: str) -> dict:
    import shlex
    import shutil
    import subprocess
    if not command.strip():
        return {"error": "empty command"}
    args = shlex.split(command)
    if args and args[0] in _CLI_BLOCKED:
        return {
            "error": f"command not allowed: {args[0]}",
        }
    kai_bin = shutil.which("kai")
    if kai_bin:
        cmd_args = [kai_bin] + args
    else:
        # Frozen sidecar: kai is not on PATH, call
        # the CLI entry point directly in-process.
        from kaisho.cli.main import cli
        import io
        from contextlib import redirect_stdout, redirect_stderr
        out, err = io.StringIO(), io.StringIO()
        try:
            with redirect_stdout(out), redirect_stderr(err):
                cli(args, standalone_mode=False)
        except SystemExit:
            pass
        except Exception as exc:
            return {"error": str(exc)}
        output = out.getvalue().strip()
        return {"output": output} if output else {
            "error": err.getvalue().strip() or "no output",
        }
    try:
        result = subprocess.run(
            cmd_args, capture_output=True,
            text=True, timeout=60,
        )
    except subprocess.TimeoutExpired:
        return {"error": "command timed out (60s)"}
    output = result.stdout.strip()
    if result.returncode != 0:
        err = result.stderr.strip() or output
        return {"error": f"exit {result.returncode}: {err}"}
    return {"output": output}


def _get_time_insights(period: str) -> dict:
    """Return time insights for the advisor."""
    from ..services.time_insights import (
        billable_contracts, is_billable, period_range,
    )
    backend = _backend()
    start, end = period_range(period)
    entries = backend.clocks.list_entries(
        period="all", from_date=start, to_date=end,
    )
    billable_set = billable_contracts(backend)
    billable_min = 0
    non_billable_min = 0
    by_cust: dict[str, dict] = {}
    for e in entries:
        mins = e.get("duration_minutes") or 0
        cust = e.get("customer", "Unknown")
        is_bill = is_billable(e, billable_set)
        if is_bill:
            billable_min += mins
        else:
            non_billable_min += mins
        if cust not in by_cust:
            by_cust[cust] = {
                "total_min": 0, "billable_min": 0,
            }
        by_cust[cust]["total_min"] += mins
        if is_bill:
            by_cust[cust]["billable_min"] += mins
    customers = sorted(
        [{"name": k, **v} for k, v in by_cust.items()],
        key=lambda x: x["total_min"], reverse=True,
    )
    total = billable_min + non_billable_min
    return {
        "period": period,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "total_hours": round(total / 60, 1),
        "billable_hours": round(billable_min / 60, 1),
        "non_billable_hours": round(
            non_billable_min / 60, 1,
        ),
        "billable_pct": (
            round(billable_min / total * 100)
            if total > 0 else 0
        ),
        "by_customer": [
            {
                "name": c["name"],
                "hours": round(c["total_min"] / 60, 1),
                "billable_hours": round(
                    c["billable_min"] / 60, 1,
                ),
            }
            for c in customers
        ],
    }


def _list_cron_jobs() -> dict:
    """List all cron job definitions."""
    from ..config import get_config
    from ..services.cron import list_jobs
    cfg = get_config()
    return {"jobs": list_jobs(cfg.JOBS_FILE)}


def _list_cron_templates() -> dict:
    """Return available cron templates (metadata + prompt
    bodies). Strips the prompt body from the result to
    keep tool output compact — the model sees the
    description and can ask the user which template to
    pick. The prompt is loaded server-side when
    create_cron_from_template runs."""
    from ..services.cron_templates import (
        list_cron_templates as _read_templates,
    )
    templates = _read_templates()
    compact = [
        {k: v for k, v in t.items() if k != "prompt"}
        for t in templates
    ]
    return {"templates": compact}


def _create_cron_from_template(
    template_id: str,
    job_id: str,
    name: str | None = None,
    schedule: str | None = None,
    enabled: bool = False,
) -> dict:
    """Stamp a new cron job from a template.

    Copies the template's prompt body into a fresh prompt
    file under the user's profile directory so per-job
    customisation doesn't mutate the shared template, and
    so the file survives Kaisho version updates (the
    runtime install dir gets refreshed on update; the
    profile dir does not).
    """
    from ..config import get_config
    from ..services.cron import add_job, get_job
    from ..services.cron_templates import (
        get_cron_template,
    )

    err = _validate_job_id(job_id)
    if err:
        return {"error": err}

    tpl = get_cron_template(template_id)
    if tpl is None:
        return {
            "error": f"Template not found: {template_id}",
        }

    cfg = get_config()
    if get_job(cfg.JOBS_FILE, job_id) is not None:
        return {
            "error": f"Job already exists: {job_id}",
        }

    prompt_path = _write_user_prompt(
        cfg, job_id, tpl["prompt"],
    )

    job = {
        "id": job_id,
        "name": name or tpl["name"],
        "schedule": schedule or tpl["default_schedule"],
        "model": tpl["default_model"],
        "prompt_file": str(prompt_path),
        "output": tpl["default_output"],
        "timeout": tpl["default_timeout"],
        "enabled": enabled,
        "inject_context": tpl.get(
            "default_inject_context", True,
        ),
    }
    try:
        add_job(cfg.JOBS_FILE, job)
    except ValueError as exc:
        # Roll back: remove the orphan prompt file we
        # just wrote so the next attempt starts clean.
        prompt_path.unlink(missing_ok=True)
        return {"error": str(exc)}

    from .scheduler import sync_jobs
    sync_jobs(cfg.JOBS_FILE)

    return {
        "ok": True,
        "job_id": job_id,
        "model": job["model"],
        "schedule": job["schedule"],
        "enabled": enabled,
    }


def _trigger_cron_job(job_id: str) -> dict:
    """Trigger a cron job to run immediately."""
    import threading
    from ..config import get_config
    from ..services.cron import (
        get_job, start_run, finish_run,
    )
    cfg = get_config()
    job = get_job(cfg.JOBS_FILE, job_id)
    if job is None:
        return {"error": f"Job not found: {job_id}"}

    run_id = start_run(
        cfg.PROFILE_DIR, job_id,
        job.get("model", ""),
    )

    def run_bg() -> None:
        from pathlib import Path
        from .executor import execute_job
        from ..services.settings import (
            get_ai_settings,
            get_cloud_sync_key,
            load_settings,
        )
        data = load_settings(cfg.SETTINGS_FILE)
        ai = get_ai_settings(data)
        sync = data.get("cloud_sync", {})
        try:
            # execute_job already calls write_output
            # internally — do not call it again here.
            output = execute_job(
                job,
                project_root=(
                    Path(__file__).parent.parent.parent
                ),
                ollama_base_url=ai["ollama_url"],
                ollama_api_key=ai.get(
                    "ollama_api_key", "",
                ),
                ollama_cloud_url=ai.get(
                    "ollama_cloud_url", "",
                ),
                ollama_cloud_api_key=ai.get(
                    "ollama_cloud_api_key", "",
                ),
                lm_studio_base_url=ai.get(
                    "lm_studio_url", "",
                ),
                claude_api_key=ai.get(
                    "claude_api_key", "",
                ),
                openrouter_base_url=ai.get(
                    "openrouter_url", "",
                ),
                openrouter_api_key=ai.get(
                    "openrouter_api_key", "",
                ),
                openai_base_url=ai.get(
                    "openai_url", "",
                ),
                openai_api_key=ai.get(
                    "openai_api_key", "",
                ),
                cloud_url=sync.get("url", ""),
                cloud_api_key=get_cloud_sync_key(data),
            )
            finish_run(
                cfg.PROFILE_DIR, run_id,
                "ok", output=output[:4000],
            )
        except Exception as exc:
            finish_run(
                cfg.PROFILE_DIR, run_id,
                "error", error=str(exc),
            )

    threading.Thread(
        target=run_bg, daemon=True,
    ).start()

    return {
        "triggered": True,
        "job_id": job_id,
        "run_id": run_id,
        "status": "running",
        "note": (
            "The job is running in the background. "
            "You cannot wait for it or monitor it. "
            "Tell the user it was triggered and they "
            "can check results in the Cron view."
        ),
    }


def _create_backup(prune: bool = True) -> dict:
    """Create a backup archive and optionally prune."""
    from ..config import get_config
    from ..services import backup as backup_svc
    from ..services import settings as settings_svc

    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    backup_cfg = settings_svc.get_backup_settings(data)
    target = settings_svc.resolve_backup_dir(data, cfg)

    info = backup_svc.create_backup(
        source_dir=cfg.DATA_DIR,
        backup_dir=target,
        profile=cfg.PROFILE,
    )
    removed: list[dict] = []
    keep = backup_cfg.get("keep", 0)
    if prune and keep > 0:
        removed = [
            b.to_dict()
            for b in backup_svc.prune_backups(
                target, keep,
            )
        ]
    return {
        "backup": info.to_dict(),
        "removed": removed,
    }


def _list_backups() -> dict:
    """Return existing backups newest first."""
    from ..config import get_config
    from ..services import backup as backup_svc
    from ..services import settings as settings_svc

    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    target = settings_svc.resolve_backup_dir(data, cfg)
    return {
        "backups": [
            b.to_dict()
            for b in backup_svc.list_backups(target)
        ],
    }
