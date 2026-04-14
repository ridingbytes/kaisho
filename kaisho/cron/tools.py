"""Tool dispatcher for the agentic executor.

Tool definitions live in ``tool_defs.py``.
``openai_tools()`` converts them to the OpenAI / Ollama chat format.
``execute_tool(name, args)`` dispatches a tool call to the backend.
"""
import json
from typing import Any

from .tool_defs import TOOL_DEFS


def openai_tools() -> list[dict]:
    """Return tool definitions in OpenAI / Ollama chat format."""
    result = []
    for tool in TOOL_DEFS:
        result.append({
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["input_schema"],
            },
        })
    return result


# -------------------------------------------------------------------
# Tool dispatcher
# -------------------------------------------------------------------

def execute_tool(name: str, args: Any) -> dict:
    """Execute a tool call and return a result dict.

    ``args`` may be a dict or a JSON string (Ollama sends strings).
    Never raises -- errors are returned as {"error": "..."}.
    """
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except json.JSONDecodeError:
            return {"error": f"invalid JSON args: {args!r}"}
    if not isinstance(args, dict):
        args = {}

    try:
        return _dispatch(name, args)
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


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
    task = _backend().tasks.add_task(
        customer=args["customer"],
        title=args["title"],
        status=args.get("status", "TODO"),
        tags=args.get("tags"),
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
    item = _backend().inbox.add_item(
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
    entry = _backend().clocks.quick_book(
        duration_str=args["duration"],
        customer=args["customer"],
        description=args["description"],
        contract=args.get("contract"),
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


def _list_notes(args: dict) -> dict:
    return {"notes": _backend().notes.list_notes()}


def _add_note(args: dict) -> dict:
    note = _backend().notes.add_note(
        title=args["title"],
        body=args.get("body", ""),
        customer=args.get("customer"),
    )
    return {"note": note}


def _set_task_tags(args: dict) -> dict:
    task = _backend().tasks.set_tags(
        args["task_id"], args["tags"],
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
        k: args[k] for k in ("title", "body", "tags")
        if k in args
    }
    note = _backend().notes.update_note(
        args["note_id"], updates,
    )
    return {"note": note}


def _start_clock(args: dict) -> dict:
    entry = _backend().clocks.start(
        customer=args["customer"],
        description=args["description"],
        task_id=args.get("task_id"),
        contract=args.get("contract"),
    )
    return {"entry": entry}


def _stop_clock(args: dict) -> dict:
    return {"entry": _backend().clocks.stop()}


def _update_clock_entry(args: dict) -> dict:
    result = _backend().clocks.update_entry(
        start_iso=args["start"],
        customer=args.get("customer"),
        description=args.get("description"),
        invoiced=args.get("invoiced"),
        contract=args.get("contract"),
        notes=args.get("notes"),
    )
    if result is None:
        return {"error": "Entry not found"}
    return {"entry": result}


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
    "batch_invoice": _batch_invoice,
    "list_kb_files": lambda a: _list_kb_files(),
    "list_profiles": _list_profiles,
    "rename_profile": _rename_profile,
    "delete_profile": _delete_profile,
    "create_skill": lambda a: _create_skill(
        a["name"], a["content"],
    ),
    "write_kb_file": lambda a: _write_kb_file(
        a["label"], a["filename"], a["content"],
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
    except Exception as exc:
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
        except Exception as exc:
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
    except Exception as exc:
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


def _write_kb_file(
    label: str, filename: str, content: str,
) -> dict:
    """Write a file to the knowledge base."""
    from ..services import knowledge as kb_svc
    return {
        "file": kb_svc.write_file(
            _kb_sources(), label, filename, content,
        ),
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
        except Exception as exc:
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
    if len(content) > 30_000:
        content = content[:30_000] + "\n...(truncated)"
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


def _execute_cli(command: str) -> dict:
    import shlex
    import shutil
    import subprocess
    if not command.strip():
        return {"error": "empty command"}
    kai_bin = shutil.which("kai")
    if not kai_bin:
        return {"error": "kai CLI not found in PATH"}
    cmd_args = [kai_bin] + shlex.split(command)
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
    from ..api.routers.dashboard import (
        _billable_contracts, _is_billable, _period_range,
    )
    backend = _backend()
    start, end = _period_range(period)
    entries = backend.clocks.list_entries(
        period="all", from_date=start, to_date=end,
    )
    billable_set = _billable_contracts(backend)
    billable_min = 0
    non_billable_min = 0
    by_cust: dict[str, dict] = {}
    for e in entries:
        mins = e.get("duration_minutes") or 0
        cust = e.get("customer", "Unknown")
        is_bill = _is_billable(e, billable_set)
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
