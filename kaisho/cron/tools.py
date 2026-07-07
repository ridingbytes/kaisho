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
    # Local read/write tools, plus the user's connected
    # premium integrations (Pro) — executed server-side via
    # execute_tool's dispatch. Lazy import avoids an import
    # cycle (integration_tools -> services -> cron.tools).
    from ..services.integration_tools import (
        advisor_integration_defs,
    )
    defs = [
        {
            "name": t["name"],
            "description": t["description"],
            "input_schema": t["input_schema"],
        }
        for t in TOOL_DEFS
        if t.get("tier", "read") in ("read", "write")
    ]
    defs.extend(advisor_integration_defs())
    return defs


def advisor_safe_tools() -> list[dict]:
    """Advisor-safe tools in OpenAI / Ollama chat shape."""
    return _to_openai_tools(advisor_safe_tool_defs())


def advisor_integration_tools() -> list[dict]:
    """Connected premium-integration tools (Pro) in
    OpenAI / Ollama chat shape.

    Unlike :func:`advisor_safe_tools`, this returns only
    the integration tools (no local read/write tools) so
    the cloud ``kaisho:`` advisor can offer them on top of
    its CLI tool without also exposing the local toolbox.
    """
    from ..services.integration_tools import (
        advisor_integration_defs,
    )
    return _to_openai_tools(advisor_integration_defs())


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

    # Premium integration tools (linear_*/github_*/slack_*/
    # google_*) execute server-side in Kaisho Cloud, where
    # their credentials live. Lazy import: see
    # advisor_safe_tool_defs.
    from ..services.integration_tools import (
        dispatch_integration_tool,
        is_integration_tool,
    )
    if is_integration_tool(name):
        return dispatch_integration_tool(name, args)

    tier = _tool_tier(name)
    cap_err = guards.check_caps(name, tier)
    if cap_err is not None:
        return cap_err
    guards.maybe_auto_snapshot(name, tier)

    # Dispatcher boundary: any handler error is converted
    # into a structured tool-result so a single bad call
    # cannot tear down the advisor / cron loop. Do not
    # tighten to a narrower exception type without
    # preserving that contract -- a future linter sweep
    # that "fixes" this BLE001 will surface handler errors
    # to the agent loop instead of the model.
    try:
        return _dispatch(name, args)
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


_TIER_BY_NAME: dict[str, str] = {
    t["name"]: t.get("tier", "read") for t in TOOL_DEFS
}


def _tool_tier(name: str) -> str:
    """Look up the declared tier for a tool name.

    Unknown tools are treated as ``destructive`` so a tool
    added to dispatch without a ``TOOL_DEFS`` entry is
    counted against the write cap rather than slipping past
    it. ``_dispatch`` will still reject genuinely unknown
    names on its own.
    """
    return _TIER_BY_NAME.get(name, "destructive")


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
        deadline=args.get("deadline"),
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
    """List customers with explicit, pre-computed budget
    fields so the advisor model can't invert ``used`` and
    ``rest`` (reported by user 2026-05-31: model labelled
    ``rest=36h`` as '91% used' for ISC, etc.).

    Each customer row carries:
      budget_hours / used_hours / rest_hours / pct_used
    """
    customers = _backend().customers.list_customers()
    for c in customers:
        budget = float(c.get("budget") or 0)
        used = float(c.get("used") or 0)
        rest = float(c.get("rest") or 0)
        pct = (
            round((used / budget) * 100)
            if budget > 0 else 0
        )
        c["budget_hours"] = budget
        c["used_hours"] = used
        c["rest_hours"] = rest
        c["pct_used"] = pct
    return {"customers": customers}


def _list_contracts(args: dict) -> dict:
    """List a customer's contracts with an explicit ``state``
    field so the advisor model can't confuse historical
    invoiced contracts with the active budget.

    State values:
      ``active``    no end_date, not invoiced -> live budget
      ``invoiced``  already invoiced -> historical, ignore
                    for 'remaining capacity' reasoning
      ``ended``     end_date in past, not invoiced -> closed
    """
    from datetime import date
    contracts = _backend().customers.list_contracts(
        args["customer"],
    )
    today = date.today().isoformat()
    for c in contracts:
        end = c.get("end_date") or ""
        if c.get("invoiced"):
            c["state"] = "invoiced"
        elif end and end < today:
            c["state"] = "ended"
        else:
            c["state"] = "active"
        # Pre-compute pct_used so the model doesn't invert
        # used / rest. Same fix as _list_customers.
        budget = float(c.get("budget") or 0)
        used = float(c.get("used") or 0)
        rest = float(c.get("rest") or 0)
        c["budget_hours"] = budget
        c["used_hours"] = used
        c["rest_hours"] = rest
        c["pct_used"] = (
            round((used / budget) * 100)
            if budget > 0 else 0
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
        deadline=args.get("deadline"),
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
    from ..config import get_config
    from ..services import settings as settings_svc
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    minutes, mode = settings_svc.get_rounding(data)
    return {
        "entry": _backend().clocks.stop(
            rounding_minutes=minutes,
            rounding_mode=mode,
        ),
    }


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
    # Require a scope. With both omitted, ``list_entries``
    # returns every entry for the year and we would
    # invoice the user's entire history in one call — a
    # destructive, near-irreversible action that an LLM
    # could trigger by leaving the args blank.
    if not customer and not contract:
        return {
            "error": (
                "batch_invoice requires a customer or a "
                "contract to scope which entries to mark "
                "invoiced"
            ),
        }
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
# Projects
# -------------------------------------------------------------------

def _projects_file():
    from ..backends import active_config
    return active_config().PROJECTS_FILE


def _list_projects(args: dict) -> dict:
    from ..services import projects as projects_svc
    projects = projects_svc.list_projects(
        _projects_file(),
        include_archived=bool(args.get("include_archived")),
    )
    return {"projects": projects}


def _get_project(args: dict) -> dict:
    """Return a project with its assigned tasks and total
    logged time."""
    from ..services import projects as projects_svc
    pid = args["project_id"]
    result = projects_svc.aggregate_project(
        _projects_file(), _backend(), pid,
    )
    if result is None:
        return {"error": f"Project not found: {pid}"}
    # Drop the full entry list for the LLM; the total and
    # task list are the useful signal.
    return {
        "project": result["project"],
        "tasks": result["tasks"],
        "total_minutes": result["total_minutes"],
    }


def _add_project(args: dict) -> dict:
    from ..services import projects as projects_svc
    if args.get("customer"):
        _backend().customers.ensure_customer(args["customer"])
    project = projects_svc.add_project(
        _projects_file(),
        name=args["name"],
        customer=args.get("customer"),
        description=args.get("description", ""),
        status=args.get("status", "ACTIVE"),
        due=args.get("due"),
    )
    return {"project": project}


def _update_project(args: dict) -> dict:
    from ..services import projects as projects_svc
    fields = {
        k: args[k] for k in (
            "name", "description", "status", "customer",
            "contract", "start", "due", "color",
        ) if k in args
    }
    project = projects_svc.update_project(
        _projects_file(), args["project_id"], **fields,
    )
    if project is None:
        return {"error": "Project not found"}
    return {"project": project}


def _delete_project(args: dict) -> dict:
    from ..services import projects as projects_svc
    from ..services import cloud_sync as sync_svc
    pid = args["project_id"]
    project = projects_svc.get_project(_projects_file(), pid)
    ok = projects_svc.delete_project(_projects_file(), pid)
    if ok and project:
        sync_svc.on_local_delete_project(project)
    return {"deleted": ok}


def _add_project_milestone(args: dict) -> dict:
    from ..services import projects as projects_svc
    m = projects_svc.add_milestone(
        _projects_file(), args["project_id"],
        args["title"], due=args.get("due"),
    )
    if m is None:
        return {"error": "Project not found"}
    return {"milestone": m}


def _assign_task_to_project(args: dict) -> dict:
    """Assign a task to a project and optional milestone."""
    task = _backend().tasks.update_task(
        args["task_id"],
        project=args["project_id"],
        milestone=args.get("milestone") or None,
    )
    return {"task": task}


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
    "list_projects": _list_projects,
    "get_project": _get_project,
    "add_project": _add_project,
    "update_project": _update_project,
    "delete_project": _delete_project,
    "add_project_milestone": _add_project_milestone,
    "assign_task_to_project": _assign_task_to_project,
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
    "list_calendar_events": lambda a: _list_calendar_events(
        frm=a.get("from"),
        to=a.get("to"),
        account_id=a.get("account_id"),
        limit=a.get("limit"),
    ),
    "get_calendar_event": lambda a: _get_calendar_event(
        event_id=a["event_id"],
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
    "get_cron_job": lambda a: _get_cron_job(a["job_id"]),
    "update_cron_prompt": lambda a: _update_cron_prompt(
        a["job_id"], a["prompt"],
    ),
    "create_cron_from_template": lambda a: (
        _create_cron_from_template(
            template_id=a["template_id"],
            job_id=a["job_id"],
            name=a.get("name"),
            schedule=a.get("schedule"),
            enabled=a.get("enabled", False),
            prompt=a.get("prompt"),
        )
    ),
    "trigger_cron_job": lambda a: _trigger_cron_job(
        a["job_id"],
    ),
    "create_backup": lambda a: _create_backup(
        prune=a.get("prune", True),
    ),
    "list_backups": lambda a: _list_backups(),
    "get_settings": lambda a: _get_settings(),
    "set_tags": lambda a: _set_tags(a.get("tags")),
    "set_task_state": lambda a: _set_task_state(
        name=a.get("name", ""),
        label=a.get("label", ""),
        color=a.get("color", ""),
        done=a.get("done"),
        after=a.get("after"),
    ),
    "set_list_setting": lambda a: _set_list_setting(
        a.get("key", ""), a.get("values"),
    ),
    "set_clock_rounding": lambda a: _set_clock_rounding(
        a.get("minutes"),
    ),
    "set_backup_retention": lambda a: _set_backup_retention(
        a.get("keep"),
    ),
    "set_timezone": lambda a: _set_timezone(
        a.get("timezone", ""),
    ),
    "set_ai_model": lambda a: _set_ai_model(
        advisor_model=a.get("advisor_model"),
        cron_model=a.get("cron_model"),
    ),
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

    # Enforce the allowlist first, for every URL. The PyPI
    # JSON-API rewrite below used to run before this check,
    # letting any pypi.org URL through unconditionally — a
    # hole in the SSRF/allowlist guard the model controls.
    domain = _extract_domain(url)
    if not _is_domain_allowed(domain):
        return {
            "pending_approval": True,
            "domain": domain, "url": url,
        }

    # PyPI project pages are JS-rendered; use the JSON API.
    pypi_url = _rewrite_pypi_url(url)
    if pypi_url:
        try:
            return _fetch_pypi(pypi_url)
        except (OSError, ValueError) as exc:
            return {"error": str(exc)}
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
    """Add a domain to the URL allowlist on behalf of the
    advisor.

    Logs the approval at INFO so a later review can see
    which domains the agent (vs. the user via the Settings
    UI) added to the allowlist. Source is always
    ``advisor`` here because this is the tool-dispatch
    path; the UI route writes via the
    ``PUT /url_allowlist`` endpoint.
    """
    import logging
    from ..config import get_config
    from ..services.settings import add_to_url_allowlist
    logger = logging.getLogger(__name__)
    cfg = get_config()
    allowlist = add_to_url_allowlist(
        cfg.SETTINGS_FILE, domain,
    )
    logger.info(
        "url_allowlist approved domain=%r source=advisor",
        domain,
    )
    return {"allowlist": allowlist}


def _kb_sources() -> list[dict]:
    from ..config import get_config
    from ..services.settings import (
        get_kb_sources, load_settings,
    )
    cfg = get_config()
    return get_kb_sources(load_settings(cfg.SETTINGS_FILE), cfg)


def _list_kb_files() -> dict:
    from ..config import get_config
    from ..services import knowledge as kb_svc
    profile_dir = get_config().PROFILE_DIR
    return {
        "files": kb_svc.file_tree(_kb_sources(), profile_dir),
    }


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
    # ``max_results`` is the historical name exposed to the
    # LLM tool; it now caps distinct *files* rather than
    # raw line hits (post-1.6 search rework).
    from ..services import knowledge as kb_svc
    return {
        "results": kb_svc.search(
            _kb_sources(), query, max_files=max_results,
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


def _list_calendar_events(
    frm: str | None = None,
    to: str | None = None,
    account_id: str | None = None,
    limit: int | None = None,
) -> dict:
    """Advisor handler returning events across every
    connected calendar source (local CalDAV + cloud
    Google Calendar when the user is Pro and connected).

    Defaults: ``from`` = today **00:00 local**, ``to`` =
    ``from + 7 days``. The earlier implementation defaulted
    ``from`` to ``datetime.now()`` so a 14:00 advisor query
    silently dropped every event earlier the same day (the
    user saw "your calendar is empty" with morning meetings
    scheduled). See review L1.

    Returns ``{"events": [...], "sources": [...]}`` so the
    model can say "your Google calendar is unreachable"
    instead of silently returning a partial result. See
    review S2.
    """
    from datetime import datetime, time as dtime, timedelta
    from ..services import calendar_aggregator as agg
    from ..services import caldav as caldav_svc

    if frm:
        frm_dt = datetime.fromisoformat(frm)
    else:
        today = datetime.now().date()
        frm_dt = datetime.combine(today, dtime.min)
    to_dt = (
        datetime.fromisoformat(to)
        if to else frm_dt + timedelta(days=7)
    )

    # ``account_id`` filters CalDAV only -- Google events
    # would not be retrievable that way anyway. When an
    # account_id is supplied, skip Google to honour the
    # user's restriction.
    if account_id:
        try:
            events = caldav_svc.list_events(
                frm=frm_dt, to=to_dt,
                account_id=account_id, limit=limit,
            )
        except caldav_svc.CalDavError as exc:
            return {"error": str(exc)}
        return {
            "events": events,
            "sources": [{
                "id": "caldav",
                "ok": True,
                "count": len(events),
            }],
        }

    return agg.list_events(
        frm=frm_dt, to=to_dt, limit=limit,
    )


def _get_calendar_event(event_id: str) -> dict:
    """Advisor handler returning the full record for one
    calendar event by its opaque id."""
    from ..services import caldav as caldav_svc
    try:
        event = caldav_svc.get_event(event_id)
    except caldav_svc.CalDavError as exc:
        return {"error": str(exc)}
    return {"event": event}


# execute_cli is reachable by the AI advisor and cron, both
# of which are exposed to prompt injection. Gate it with an
# ALLOWLIST of safe top-level commands (a blocklist let
# "task delete <id> --yes" through), and additionally reject
# any destructive verb or confirm/force flag inside an
# otherwise-allowed command. Deletes/renames are not
# available to the agent at all -- they go through the UI.
# ``kb`` / ``knowledge`` are intentionally NOT here -- the
# model has dedicated ``write_kb_file``, ``read_knowledge_file``,
# ``search_knowledge`` and ``list_kb_files`` tools that go
# through the KB write rails (1 MB cap, overwrite=true,
# per-run write counter). The CLI variants bypass those.
# ``ask`` is excluded so the advisor cannot recursively
# invoke another advisor and escape its token budget; the
# dedicated ``advisor`` tool is the right escalation path.
_CLI_ALLOWED = {
    "task", "clock", "note", "customer", "contract",
    "inbox", "tag", "briefing",
    "gh", "version",
}
_CLI_DESTRUCTIVE = {
    "delete", "remove", "rm", "rename", "purge", "destroy",
}
_CLI_DESTRUCTIVE_FLAGS = {"--yes", "-y", "--force", "-f"}


def _execute_cli(command: str) -> dict:
    import shlex
    import shutil
    import subprocess
    if not command.strip():
        return {"error": "empty command"}
    args = shlex.split(command)
    if not args or args[0] not in _CLI_ALLOWED:
        return {
            "error": f"command not allowed: {args[0] if args else ''}",
        }
    lowered = {a.lower() for a in args}
    if (lowered & _CLI_DESTRUCTIVE
            or lowered & _CLI_DESTRUCTIVE_FLAGS):
        return {
            "error": "destructive commands are not allowed "
                     "from the advisor; use the app UI",
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
        except Exception as exc:  # noqa: BLE001
            return {"error": str(exc)}
        output = out.getvalue().strip()
        return {"output": output} if output else {
            "error": err.getvalue().strip() or "no output",
        }
    from ..subproc import run as _run
    try:
        result = _run(
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


def _prompt_path_for_job(job: dict) -> Path:
    """Resolve a job's prompt file to an absolute path.

    Mirrors the executor: expand ``~`` first, then join a
    relative path onto the install root (where built-in
    template prompts live)."""
    from ..config import get_project_root
    p = Path(job.get("prompt_file", "")).expanduser()
    if not p.is_absolute():
        p = get_project_root() / p
    return p


def _placeholder_report(body: str) -> dict:
    """Split the placeholders used in ``body`` into known
    and unknown, for advisor-facing diagnostics."""
    from ..services.placeholders import (
        find_placeholders,
        is_known_placeholder,
    )
    used = find_placeholders(body)
    unknown = sorted(
        n for n in used if not is_known_placeholder(n)
    )
    return {"used": sorted(used), "unknown": unknown}


def _reject_unknown_placeholders(body: str) -> str | None:
    """Return an error message if ``body`` contains an
    unknown ``${...}`` placeholder, else None.

    Guards the write path so a typo like ``${user.compny}``
    is caught before it silently renders as a literal token
    at run time. Escape a literal with ``\\${...}``."""
    from ..services.placeholders import valid_placeholders_help
    unknown = _placeholder_report(body)["unknown"]
    if not unknown:
        return None
    return (
        "Unknown placeholders: "
        + ", ".join(f"${{{n}}}" for n in unknown)
        + ". Valid: " + valid_placeholders_help()
        + ". Escape a literal as \\${...}."
    )


def _create_cron_from_template(
    template_id: str,
    job_id: str,
    name: str | None = None,
    schedule: str | None = None,
    enabled: bool = False,
    prompt: str | None = None,
) -> dict:
    """Stamp a new cron job from a template.

    Copies the template's prompt body into a fresh prompt
    file under the user's profile directory so per-job
    customisation doesn't mutate the shared template, and
    so the file survives Kaisho version updates (the
    runtime install dir gets refreshed on update; the
    profile dir does not).

    An optional ``prompt`` overrides the template body, so
    the advisor can tailor the prompt (and its
    placeholders) to the user in one call.
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

    body = tpl["prompt"] if prompt is None else prompt
    err = _reject_unknown_placeholders(body)
    if err:
        return {"error": err}

    cfg = get_config()
    if get_job(cfg.JOBS_FILE, job_id) is not None:
        return {
            "error": f"Job already exists: {job_id}",
        }

    prompt_path = _write_user_prompt(cfg, job_id, body)

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


def _get_cron_job(job_id: str) -> dict:
    """Return a job's full config plus its prompt body and
    a placeholder report, so the advisor can read what a
    job actually does before editing it."""
    from ..config import get_config
    from ..services.cron import get_job
    cfg = get_config()
    job = get_job(cfg.JOBS_FILE, job_id)
    if job is None:
        return {"error": f"Job not found: {job_id}"}

    path = _prompt_path_for_job(job)
    if path.exists():
        prompt = path.read_text(encoding="utf-8")
        placeholders = _placeholder_report(prompt)
    else:
        prompt = None
        placeholders = {"used": [], "unknown": []}
    return {
        "job": job,
        "prompt": prompt,
        "placeholders": placeholders,
    }


def _update_cron_prompt(job_id: str, prompt: str) -> dict:
    """Overwrite a job's prompt body, validating
    placeholders first.

    Always writes to a per-job prompt file under the
    profile dir and repoints the job there, so editing a
    job that still references a shared built-in prompt
    never mutates the install dir."""
    from ..config import get_config
    from ..services.cron import get_job, update_job
    cfg = get_config()
    job = get_job(cfg.JOBS_FILE, job_id)
    if job is None:
        return {"error": f"Job not found: {job_id}"}

    err = _reject_unknown_placeholders(prompt)
    if err:
        return {"error": err}

    prompt_path = _write_user_prompt(cfg, job_id, prompt)
    if job.get("prompt_file") != str(prompt_path):
        update_job(
            cfg.JOBS_FILE, job_id,
            {"prompt_file": str(prompt_path)},
        )

    return {
        "ok": True,
        "job_id": job_id,
        "prompt_file": str(prompt_path),
        "placeholders": _placeholder_report(prompt),
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
        except Exception as exc:  # noqa: BLE001
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


# -------------------------------------------------------------------
# App settings tools
#
# The advisor may read all settings (secrets masked) and edit a
# bounded, non-secret slice: tags, kanban states, a few string-list
# vocabularies, clock rounding, backup retention, timezone, and the
# AI model choice. Secret values (API keys, tokens) and data paths
# are never readable or writable here -- masked on read, rejected on
# write -- because the advisor is exposed to prompt injection.
# -------------------------------------------------------------------

# Top-level string-list settings the advisor may replace wholesale.
# url_allowlist is deliberately EXCLUDED: it is the SSRF guard
# enforced in _fetch_url, and a prompt-injected advisor that could
# rewrite it would defeat the human-in-the-loop that keeps the
# destructive approve_url_domain tool out of its reach.
_EDITABLE_LIST_SETTINGS = (
    "customer_types", "inbox_channels",
)

# AI fields the advisor may set. Deliberately excludes every secret
# key and the provider URLs that pair with one.
_EDITABLE_AI_FIELDS = ("advisor_model", "cron_model")


def _settings_file():
    """The active profile's settings.yaml path."""
    from ..config import get_config
    return get_config().SETTINGS_FILE


def _mutate_settings(apply) -> dict:
    """Apply ``apply`` to the settings dict under the lock."""
    from ..services import settings as settings_svc
    return settings_svc.mutate_settings(_settings_file(), apply)


def _get_settings() -> dict:
    """Return the profile's settings with all secrets masked."""
    from ..services import settings as settings_svc
    data = settings_svc.load_settings(_settings_file())
    return {"settings": settings_svc.mask_secrets(data)}


def _clean_str_list(values: Any) -> list[str] | None:
    """Coerce a tool-supplied list into stripped, non-empty
    strings, or None if the shape is wrong."""
    if not isinstance(values, list):
        return None
    return [
        str(v).strip() for v in values if str(v).strip()
    ]


def _set_tags(tags: Any) -> dict:
    """Replace the tag vocabulary. Each tag needs a name;
    colour and description are optional."""
    if not isinstance(tags, list) or not tags:
        return {"error": "tags must be a non-empty list"}
    cleaned = []
    for tag in tags:
        if not isinstance(tag, dict) or not tag.get("name"):
            return {"error": "each tag needs a 'name'"}
        cleaned.append({
            "name": str(tag["name"]).strip(),
            "color": str(tag.get("color", "")).strip(),
            "description": str(
                tag.get("description", ""),
            ).strip(),
        })

    def _apply(data: dict) -> None:
        data["tags"] = cleaned

    _mutate_settings(_apply)
    return {"ok": True, "tags": cleaned}


def _set_task_state(
    name: str,
    label: str,
    color: str,
    done: bool | None = None,
    after: str | None = None,
) -> dict:
    """Add a kanban column, or update an existing one by
    name. Never removes a state (that would orphan tasks
    already in it), so this is a safe upsert.

    On update, ``done`` is only changed when explicitly
    supplied -- an advisor editing just the label or colour
    must not silently flip a done-column back to not-done
    and reclassify every task in it."""
    if not name or not label:
        return {"error": "name and label are required"}
    from ..backends import reset_backend

    def _apply(data: dict) -> None:
        states = data.get("task_states", [])
        for state in states:
            if state["name"] == name:
                state["label"] = label
                state["color"] = color
                if done is not None:
                    state["done"] = bool(done)
                data["task_states"] = states
                return
        new = {
            "name": name, "label": label,
            "color": color, "done": bool(done),
        }
        idx = next(
            (
                i for i, s in enumerate(states)
                if s["name"] == after
            ),
            None,
        )
        if idx is None:
            states.append(new)
        else:
            states.insert(idx + 1, new)
        data["task_states"] = states

    _mutate_settings(_apply)
    # The org parser's TODO-keyword set is derived from
    # task_states; rebuild so a new column is recognised.
    reset_backend()
    return {"ok": True, "name": name}


def _set_list_setting(key: str, values: Any) -> dict:
    """Replace one of the allowlisted string-list settings
    (customer_types, inbox_channels). url_allowlist is
    excluded on purpose -- it is a security control."""
    if key not in _EDITABLE_LIST_SETTINGS:
        allowed = ", ".join(_EDITABLE_LIST_SETTINGS)
        return {
            "error": f"key must be one of: {allowed}",
        }
    cleaned = _clean_str_list(values)
    if cleaned is None:
        return {"error": "values must be a list of strings"}

    def _apply(data: dict) -> None:
        data[key] = cleaned

    _mutate_settings(_apply)
    return {"ok": True, "key": key, "values": cleaned}


def _is_int(value: Any) -> bool:
    """True only for real ints. Rejects bool, which is an
    int subclass and would otherwise pass numeric checks."""
    return isinstance(value, int) and not isinstance(value, bool)


def _set_clock_rounding(minutes: int) -> dict:
    """Set the clock rounding interval in minutes."""
    if not _is_int(minutes) or minutes < 0:
        return {
            "error": "minutes must be a non-negative integer",
        }
    from ..services import settings as settings_svc
    block = settings_svc.set_clocks_settings(
        _settings_file(), {"rounding_minutes": minutes},
    )
    return {"ok": True, "clocks": block}


def _set_backup_retention(keep: int) -> dict:
    """Set how many recent backups to retain."""
    if not _is_int(keep) or keep < 1:
        return {"error": "keep must be an integer >= 1"}
    from ..services import settings as settings_svc
    block = settings_svc.set_backup_settings(
        _settings_file(), {"keep": keep},
    )
    return {"ok": True, "backup": block}


def _set_timezone(timezone: str) -> dict:
    """Set the profile timezone (validated IANA name)."""
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
    try:
        ZoneInfo(timezone)
    except (ZoneInfoNotFoundError, ValueError):
        return {
            "error": f"unknown timezone: {timezone!r}",
        }

    def _apply(data: dict) -> None:
        data["timezone"] = timezone

    _mutate_settings(_apply)
    return {"ok": True, "timezone": timezone}


def _set_ai_model(
    advisor_model: str | None = None,
    cron_model: str | None = None,
) -> dict:
    """Set the advisor and/or cron model. Only these two
    non-secret fields are writable -- keys and provider
    URLs are never touched here."""
    updates = {}
    for field, value in (
        ("advisor_model", advisor_model),
        ("cron_model", cron_model),
    ):
        if value is None:
            continue
        cleaned = str(value).strip()
        if not cleaned:
            return {
                "error": f"{field} must not be empty",
            }
        updates[field] = cleaned
    if not updates:
        return {
            "error": (
                "supply advisor_model and/or cron_model"
            ),
        }
    from ..services import settings as settings_svc
    ai = settings_svc.set_ai_settings(
        _settings_file(), updates,
    )
    return {"ok": True, "ai": ai}
