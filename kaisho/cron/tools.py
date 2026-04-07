"""Tool definitions and dispatcher for the agentic executor.

Tools are defined in Anthropic format (input_schema).
``openai_tools()`` converts them to the OpenAI / Ollama chat format.
``execute_tool(name, args)`` dispatches a tool call to the backend.
"""
import json
from typing import Any


# ---------------------------------------------------------------------------
# Tool definitions (Anthropic / claude format)
# ---------------------------------------------------------------------------

TOOL_DEFS: list[dict] = [
    {
        "name": "list_tasks",
        "description": (
            "List tasks from the kanban board. "
            "Returns id, customer, title, status, tags for each task."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "customer": {
                    "type": "string",
                    "description": "Filter by customer name (optional)",
                },
                "status": {
                    "type": "string",
                    "description": (
                        "Filter by status, e.g. TODO, IN-PROGRESS"
                        " (optional)"
                    ),
                },
                "include_done": {
                    "type": "boolean",
                    "description": "Include completed/archived tasks (default false)",
                },
            },
        },
    },
    {
        "name": "add_task",
        "description": "Create a new task on the kanban board.",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer": {"type": "string"},
                "title": {"type": "string"},
                "status": {
                    "type": "string",
                    "description": "e.g. TODO, IN-PROGRESS, WAIT (default: TODO)",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional tag names",
                },
            },
            "required": ["customer", "title"],
        },
    },
    {
        "name": "move_task",
        "description": "Change the status of an existing task.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "status": {"type": "string"},
            },
            "required": ["task_id", "status"],
        },
    },
    {
        "name": "list_inbox",
        "description": "List items currently in the inbox.",
        "input_schema": {
            "type": "object",
            "properties": {
                "item_type": {
                    "type": "string",
                    "description": "Filter by type, e.g. TASK, NOTE (optional)",
                },
            },
        },
    },
    {
        "name": "add_inbox_item",
        "description": "Capture a new item to the inbox.",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "Title / headline of the item",
                },
                "item_type": {
                    "type": "string",
                    "description": "Type keyword, e.g. NOTIZ, TASK (optional)",
                },
                "customer": {
                    "type": "string",
                    "description": "Customer name (optional)",
                },
                "body": {
                    "type": "string",
                    "description": "Additional body text (optional)",
                },
            },
            "required": ["text"],
        },
    },
    {
        "name": "list_clock_entries",
        "description": "List time-tracking clock entries.",
        "input_schema": {
            "type": "object",
            "properties": {
                "period": {
                    "type": "string",
                    "description": "today, week, or month (default: week)",
                },
            },
        },
    },
    {
        "name": "book_time",
        "description": "Book time for a customer retroactively.",
        "input_schema": {
            "type": "object",
            "properties": {
                "duration": {
                    "type": "string",
                    "description": "Duration string, e.g. 1h30m or 90m",
                },
                "customer": {"type": "string"},
                "description": {"type": "string"},
            },
            "required": ["duration", "customer", "description"],
        },
    },
    {
        "name": "list_customers",
        "description": "List all customers with budget and consumption info.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "list_contracts",
        "description": (
            "List contracts for a customer with budget and "
            "consumption info."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "customer": {
                    "type": "string",
                    "description": "Customer name",
                },
            },
            "required": ["customer"],
        },
    },
    {
        "name": "search_knowledge",
        "description": (
            "Search the knowledge base (documentation, notes, "
            "research files) for relevant information. Returns "
            "matching snippets with file path and line number."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Max results (default 10)",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "read_knowledge_file",
        "description": (
            "Read the full content of a knowledge base file "
            "by its relative path."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": (
                        "Relative file path as shown in search "
                        "results"
                    ),
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "list_notes",
        "description": "List all notes.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "add_note",
        "description": "Create a new note.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "body": {
                    "type": "string",
                    "description": "Note body text (optional)",
                },
                "customer": {
                    "type": "string",
                    "description": "Customer name (optional)",
                },
            },
            "required": ["title"],
        },
    },
    {
        "name": "set_task_tags",
        "description": "Set tags on a task (replaces all).",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
            "required": ["task_id", "tags"],
        },
    },
    {
        "name": "archive_task",
        "description": "Archive a task by ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
            },
            "required": ["task_id"],
        },
    },
    {
        "name": "update_task",
        "description": "Update a task's title, customer, or body.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "title": {
                    "type": "string",
                    "description": "New title (optional)",
                },
                "customer": {
                    "type": "string",
                    "description": "New customer (optional)",
                },
                "body": {
                    "type": "string",
                    "description": "New body text (optional)",
                },
            },
            "required": ["task_id"],
        },
    },
    {
        "name": "delete_note",
        "description": "Delete a note by ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "note_id": {"type": "string"},
            },
            "required": ["note_id"],
        },
    },
    {
        "name": "update_note",
        "description": "Update a note's title, body, or tags.",
        "input_schema": {
            "type": "object",
            "properties": {
                "note_id": {"type": "string"},
                "title": {
                    "type": "string",
                    "description": "New title (optional)",
                },
                "body": {
                    "type": "string",
                    "description": "New body (optional)",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": (
                        "Replace all tags (optional)"
                    ),
                },
            },
            "required": ["note_id"],
        },
    },
    {
        "name": "start_clock",
        "description": (
            "Start a running clock timer for a customer."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "customer": {"type": "string"},
                "description": {"type": "string"},
                "task_id": {
                    "type": "string",
                    "description": (
                        "Link to a task ID (optional)"
                    ),
                },
                "contract": {
                    "type": "string",
                    "description": (
                        "Contract name (optional)"
                    ),
                },
            },
            "required": ["customer", "description"],
        },
    },
    {
        "name": "stop_clock",
        "description": (
            "Stop the currently running clock timer."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "list_kb_files",
        "description": (
            "List all files in the knowledge base. "
            "Returns path, label, name, and size "
            "for each file."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "transcribe_youtube",
        "description": (
            "Fetch the transcript / captions of a YouTube video. "
            "Accepts a full YouTube URL or a bare 11-character video ID. "
            "Returns the transcript as plain text."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "YouTube URL or video ID",
                },
                "languages": {
                    "type": "string",
                    "description": (
                        "Comma-separated language preference list, "
                        "e.g. 'en,de' (default: en,de)"
                    ),
                },
            },
            "required": ["url"],
        },
    },
    {
        "name": "create_skill",
        "description": (
            "Create a reusable advisor skill template. "
            "The skill will be automatically applied when "
            "the user's request matches."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": (
                        "Skill name (kebab-case, "
                        "e.g. email-draft)"
                    ),
                },
                "content": {
                    "type": "string",
                    "description": (
                        "Skill instructions as plain text"
                    ),
                },
            },
            "required": ["name", "content"],
        },
    },
    {
        "name": "list_profiles",
        "description": (
            "List all profiles for the active user. "
            "Returns the active profile name and all available profiles."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "rename_profile",
        "description": (
            "Rename a profile. The active profile cannot be renamed."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "old_name": {
                    "type": "string",
                    "description": "Current profile name",
                },
                "new_name": {
                    "type": "string",
                    "description": (
                        "New profile name "
                        "(alphanumeric, dash, underscore only)"
                    ),
                },
            },
            "required": ["old_name", "new_name"],
        },
    },
    {
        "name": "delete_profile",
        "description": (
            "Delete a profile and all its data. "
            "The active profile cannot be deleted. "
            "This is irreversible — confirm with the user before calling."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Name of the profile to delete",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "fetch_url",
        "description": (
            "Fetch the content of an HTTP/HTTPS URL and return it as text. "
            "Useful for reading web pages, JSON APIs, RSS feeds, etc. "
            "Response is truncated to 50 000 characters. "
            "The domain must be in the URL allowlist; if not, a "
            "pending_approval response is returned instead."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string"},
                "accept": {
                    "type": "string",
                    "description": (
                        "Value for the Accept header, e.g. "
                        "application/json (optional)"
                    ),
                },
            },
            "required": ["url"],
        },
    },
    {
        "name": "approve_url_domain",
        "description": (
            "Add a domain to the URL allowlist so fetch_url can "
            "access it. Call this when the user approves a domain."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "domain": {"type": "string"},
            },
            "required": ["domain"],
        },
    },
    {
        "name": "list_github_projects",
        "description": (
            "List GitHub Projects v2 for all customers. "
            "Returns each project with its items grouped by "
            "status column (e.g. Prioritized, In Progress, Done). "
            "Use this to read ticket backlogs, prioritized queues, "
            "or any GitHub Project board data. "
            "Optionally filter by customer name or status column."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "customer": {
                    "type": "string",
                    "description": (
                        "Filter to a specific customer name "
                        "(optional)"
                    ),
                },
                "status": {
                    "type": "string",
                    "description": (
                        "Only return items with this project "
                        "status / column name, e.g. 'Prioritized' "
                        "(optional, case-insensitive)"
                    ),
                },
                "include_closed": {
                    "type": "boolean",
                    "description": (
                        "Include closed projects (default false)"
                    ),
                },
            },
        },
    },
    {
        "name": "list_github_issues",
        "description": (
            "List open GitHub issues for all customers "
            "(or a specific customer). "
            "Returns issue number, title, labels, and URL."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "customer": {
                    "type": "string",
                    "description": (
                        "Filter to a specific customer name "
                        "(optional)"
                    ),
                },
            },
        },
    },
    {
        "name": "execute_cli",
        "description": (
            "Execute a kai CLI command and return "
            "the output. Use this for any operation "
            "not covered by a dedicated tool: "
            "e.g. 'customer summary', 'gh issues "
            "--customer ISC', 'task list --customer "
            "Acme --json', 'notes list --json', "
            "'convert --from org --to markdown "
            "--source X --target Y'. "
            "The command string is everything AFTER "
            "'kai', e.g. 'gh issues --customer ISC'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": (
                        "CLI command after 'kai', "
                        "e.g. 'customer summary' or "
                        "'gh issues --customer ISC'"
                    ),
                },
            },
            "required": ["command"],
        },
    },
]


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


# ---------------------------------------------------------------------------
# Tool dispatcher
# ---------------------------------------------------------------------------

def execute_tool(name: str, args: Any) -> dict:
    """Execute a tool call and return a result dict.

    ``args`` may be a dict or a JSON string (Ollama sends strings).
    Never raises — errors are returned as {"error": "..."}.
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


def _dispatch(name: str, args: dict) -> dict:
    from ..backends import get_backend
    backend = get_backend()

    if name == "list_tasks":
        tasks = backend.tasks.list_tasks(
            customer=args.get("customer"),
            status=[args["status"]] if args.get("status") else None,
            include_done=args.get("include_done", False),
        )
        return {"tasks": tasks}

    if name == "add_task":
        task = backend.tasks.add_task(
            customer=args["customer"],
            title=args["title"],
            status=args.get("status", "TODO"),
            tags=args.get("tags"),
        )
        return {"task": task}

    if name == "move_task":
        task = backend.tasks.move_task(
            task_id=args["task_id"],
            new_status=args["status"],
        )
        return {"task": task}

    if name == "list_inbox":
        items = backend.inbox.list_items()
        if args.get("item_type"):
            items = [
                i for i in items
                if (i.get("type") or "").upper()
                == args["item_type"].upper()
            ]
        return {"items": items}

    if name == "add_inbox_item":
        item = backend.inbox.add_item(
            text=args["text"],
            item_type=args.get("item_type"),
            customer=args.get("customer"),
            body=args.get("body"),
        )
        return {"item": item}

    if name == "list_clock_entries":
        entries = backend.clocks.list_entries(
            period=args.get("period", "week")
        )
        return {"entries": entries}

    if name == "book_time":
        entry = backend.clocks.quick_book(
            duration_str=args["duration"],
            customer=args["customer"],
            description=args["description"],
            contract=args.get("contract"),
        )
        return {"entry": entry}

    if name == "list_customers":
        customers = backend.customers.list_customers()
        return {"customers": customers}

    if name == "list_contracts":
        contracts = backend.customers.list_contracts(
            args["customer"]
        )
        return {"contracts": contracts}

    if name == "search_knowledge":
        return _search_knowledge(
            args["query"],
            args.get("max_results", 10),
        )

    if name == "read_knowledge_file":
        return _read_knowledge_file(args["path"])

    if name == "transcribe_youtube":
        return _transcribe_youtube(
            args["url"],
            args.get("languages", "en,de"),
        )

    if name == "list_notes":
        return {"notes": backend.notes.list_notes()}

    if name == "add_note":
        note = backend.notes.add_note(
            title=args["title"],
            body=args.get("body", ""),
            customer=args.get("customer"),
        )
        return {"note": note}

    if name == "set_task_tags":
        task = backend.tasks.set_tags(
            args["task_id"], args["tags"]
        )
        return {"task": task}

    if name == "archive_task":
        ok = backend.tasks.archive_task(args["task_id"])
        return {"archived": ok}

    if name == "update_task":
        task = backend.tasks.update_task(
            task_id=args["task_id"],
            title=args.get("title"),
            customer=args.get("customer"),
            body=args.get("body"),
        )
        return {"task": task}

    if name == "delete_note":
        ok = backend.notes.delete_note(args["note_id"])
        return {"deleted": ok}

    if name == "update_note":
        updates = {}
        for k in ("title", "body", "tags"):
            if k in args:
                updates[k] = args[k]
        note = backend.notes.update_note(
            args["note_id"], updates,
        )
        return {"note": note}

    if name == "start_clock":
        entry = backend.clocks.start(
            customer=args["customer"],
            description=args["description"],
            task_id=args.get("task_id"),
            contract=args.get("contract"),
        )
        return {"entry": entry}

    if name == "stop_clock":
        entry = backend.clocks.stop()
        return {"entry": entry}

    if name == "list_kb_files":
        return _list_kb_files()

    if name == "list_profiles":
        from ..config import get_config, list_profiles
        cfg = get_config()
        return {
            "active": cfg.PROFILE,
            "profiles": list_profiles(cfg),
        }

    if name == "rename_profile":
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

    if name == "delete_profile":
        from ..config import delete_profile
        try:
            delete_profile(args["name"])
            return {"deleted": True, "name": args["name"]}
        except ValueError as exc:
            return {"error": str(exc)}

    if name == "create_skill":
        return _create_skill(args["name"], args["content"])

    if name == "fetch_url":
        return _fetch_url(args["url"], args.get("accept", ""))

    if name == "approve_url_domain":
        return _approve_url_domain(args["domain"])

    if name == "list_github_projects":
        return _list_github_projects(
            customer=args.get("customer"),
            status_filter=args.get("status"),
            include_closed=args.get("include_closed", False),
        )

    if name == "list_github_issues":
        return _list_github_issues(
            customer=args.get("customer"),
        )

    if name == "execute_cli":
        return _execute_cli(
            args.get("command", ""),
        )

    return {"error": f"unknown tool: {name!r}"}


def _transcribe_youtube(url: str, languages: str = "en,de") -> dict:
    """Fetch a YouTube transcript and return it as text."""
    from ..services.youtube import transcribe

    langs = [c.strip() for c in languages.split(",") if c.strip()]
    try:
        return transcribe(url, languages=langs)
    except Exception as exc:
        return {"error": str(exc)}


def _create_skill(name: str, content: str) -> dict:
    """Create an advisor skill via the service layer."""
    from pathlib import Path
    from ..config import get_config
    from ..services.advisor import save_skill
    cfg = get_config()
    data_dir = Path(str(cfg.DATA_DIR.expanduser()))
    result = save_skill(data_dir, name, content)
    return {"skill": result}




def _extract_domain(url: str) -> str:
    """Extract the domain from a URL."""
    from urllib.parse import urlparse
    return urlparse(url).hostname or ""


def _is_domain_allowed(domain: str) -> bool:
    """Check if domain is in the URL allowlist."""
    from ..config import get_config
    from ..services.settings import get_url_allowlist, load_settings
    cfg = get_config()
    data = load_settings(cfg.SETTINGS_FILE)
    allowlist = get_url_allowlist(data)
    return domain in allowlist


def _fetch_url(url: str, accept: str = "") -> dict:
    """Fetch a URL and return its body text (truncated to 50k chars).

    The domain must be in the URL allowlist. If not, a
    pending_approval response is returned instead of fetching.
    """
    import urllib.request

    if not url.startswith(("http://", "https://")):
        return {"error": "only http/https URLs are supported"}

    domain = _extract_domain(url)
    if not _is_domain_allowed(domain):
        return {
            "pending_approval": True,
            "domain": domain,
            "url": url,
        }

    headers = {"User-Agent": "occontrol-cron/1.0"}
    if accept:
        headers["Accept"] = accept
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read(50_000)
            charset = "utf-8"
            ct = resp.headers.get_content_charset()
            if ct:
                charset = ct
            body = raw.decode(charset, errors="replace")
            truncated = len(raw) >= 50_000
    except Exception as exc:
        return {"error": str(exc)}
    return {"body": body, "truncated": truncated}


def _approve_url_domain(domain: str) -> dict:
    """Add a domain to the URL allowlist."""
    from ..config import get_config
    from ..services.settings import add_to_url_allowlist
    cfg = get_config()
    result = add_to_url_allowlist(cfg.SETTINGS_FILE, domain)
    return {"allowlist": result}


def _list_kb_files() -> dict:
    """List all knowledge base files."""
    from ..services import knowledge as kb_svc
    return {"files": kb_svc.file_tree(_kb_sources())}


def _kb_sources() -> list[dict]:
    """Load KB sources from settings."""
    from ..config import get_config
    from ..services.settings import get_kb_sources, load_settings
    cfg = get_config()
    data = load_settings(cfg.SETTINGS_FILE)
    return get_kb_sources(data, cfg)


def _search_knowledge(
    query: str, max_results: int = 10
) -> dict:
    """Search the knowledge base."""
    from ..services import knowledge as kb_svc
    results = kb_svc.search(
        _kb_sources(), query, max_results=max_results,
    )
    return {"results": results}


def _read_knowledge_file(path: str) -> dict:
    """Read a knowledge base file."""
    from ..services import knowledge as kb_svc
    content = kb_svc.read_file(_kb_sources(), path)
    if content is None:
        return {"error": f"File not found: {path}"}
    if len(content) > 30_000:
        content = content[:30_000] + "\n...(truncated)"
    return {"content": content}


def _list_github_projects(
    customer: str | None = None,
    status_filter: str | None = None,
    include_closed: bool = False,
) -> dict:
    """Fetch GitHub Projects v2 and return structured data."""
    from ..backends import get_backend
    from ..services.github import GhError, projects_for_customers
    customers = get_backend().customers.list_customers()
    try:
        groups = projects_for_customers(customers)
    except GhError as exc:
        return {"error": str(exc)}

    if customer:
        groups = [
            g for g in groups
            if g["customer"].lower() == customer.lower()
        ]

    result = []
    for group in groups:
        projects = group["projects"]
        if not include_closed:
            projects = [p for p in projects if not p.get("closed")]
        formatted_projects = []
        for proj in projects:
            items = proj.get("items", [])
            if status_filter:
                items = [
                    i for i in items
                    if (i.get("status") or "").lower()
                    == status_filter.lower()
                ]
            # Group items by status preserving kanban order
            status_order = proj.get("status_order", [])
            by_status: dict[str, list[dict]] = {}
            for item in items:
                key = item.get("status") or "(no status)"
                by_status.setdefault(key, []).append(item)
            ordered_statuses = [
                s for s in status_order if s in by_status
            ] + [
                s for s in by_status if s not in status_order
            ]
            columns = [
                {
                    "status": s,
                    "items": [
                        {
                            "number": i.get("number"),
                            "title": i.get("title"),
                            "type": i.get("type"),
                            "url": i.get("url"),
                            "labels": i.get("labels", []),
                        }
                        for i in by_status[s]
                    ],
                }
                for s in ordered_statuses
            ]
            formatted_projects.append({
                "title": proj.get("title"),
                "url": proj.get("url"),
                "closed": proj.get("closed", False),
                "repo": group["repo"],
                "columns": columns,
            })
        result.append({
            "customer": group["customer"],
            "repo": group["repo"],
            "projects": formatted_projects,
        })
    return {"groups": result}


def _list_github_issues(
    customer: str | None = None,
) -> dict:
    """Fetch GitHub issues and return structured data."""
    from ..backends import get_backend
    from ..services.github import GhError, issues_for_customers
    customers = get_backend().customers.list_customers()
    try:
        groups = issues_for_customers(customers)
    except GhError as exc:
        return {"error": str(exc)}
    if customer:
        groups = [
            g for g in groups
            if g["customer"].lower() == customer.lower()
        ]
    return {"groups": groups}


def _execute_cli(command: str) -> dict:
    """Run a kai CLI command and return the output.

    Splits the command string into args and invokes
    the kai CLI via subprocess. Returns stdout or
    error.
    """
    import shlex
    import shutil
    import subprocess

    if not command.strip():
        return {"error": "empty command"}

    kai_bin = shutil.which("kai")
    if not kai_bin:
        return {
            "error": "kai CLI not found in PATH",
        }

    args = [kai_bin] + shlex.split(command)
    try:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=60,
        )
    except subprocess.TimeoutExpired:
        return {"error": "command timed out (60s)"}

    output = result.stdout.strip()
    if result.returncode != 0:
        err = result.stderr.strip() or output
        return {
            "error": f"exit {result.returncode}: "
            f"{err}",
        }
    return {"output": output}
