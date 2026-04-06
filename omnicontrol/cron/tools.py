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
        "name": "execute_cli",
        "description": (
            "Execute an occontrol CLI command and return its output. "
            "Use this to read or modify any data in the app. "
            "Pass the subcommand and its arguments as a list.\n\n"
            "Available subcommands (oc <sub> --help for details):\n"
            "  task list [--customer C] [--status S] [--tag T]\n"
            "  task add CUSTOMER TITLE [--status S] [--tag T]\n"
            "  task move TASK_ID STATUS\n"
            "  task done/next/wait/cancel TASK_ID\n"
            "  task tag TASK_ID [+TAG|-TAG|TAG]\n"
            "  task archive TASK_ID\n"
            "  inbox list [--type TYPE]\n"
            "  inbox add TEXT [--type TYPE] [--customer C]\n"
            "  inbox promote ITEM_ID --customer CUSTOMER\n"
            "  clock list [--week|--month] [--customer C]\n"
            "  clock summary [--week]\n"
            "  clock book DURATION CUSTOMER DESCRIPTION"
            " [--contract N]\n"
            "  clock start CUSTOMER DESCRIPTION"
            " [--contract N]\n"
            "  clock stop\n"
            "  clock status\n"
            "  customer list [--all]\n"
            "  customer show NAME\n"
            "  customer summary\n"
            "  contract list CUSTOMER\n"
            "  contract add CUSTOMER NAME --hours H\n"
            "  contract edit CUSTOMER NAME [--hours H]"
            " [--end DATE]\n"
            "  contract close CUSTOMER NAME\n"
            "  note list\n"
            "  note add TITLE [--customer C] [--body B]\n"
            "  cron list\n"
            "  cron trigger JOB_ID\n"
            "  briefing\n"
            "  ask QUESTION [--model M]"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "args": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": (
                        "Arguments for the oc command, e.g. "
                        "[\"task\", \"add\", \"Acme\", \"Fix the login bug\"]"
                    ),
                },
            },
            "required": ["args"],
        },
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

    if name == "create_skill":
        return _create_skill(args["name"], args["content"])

    if name == "execute_cli":
        return _execute_cli(args.get("args", []))

    if name == "fetch_url":
        return _fetch_url(args["url"], args.get("accept", ""))

    if name == "approve_url_domain":
        return _approve_url_domain(args["domain"])

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


def _execute_cli(args: list) -> dict:
    """Run 'oc <args>' via subprocess and return stdout/stderr."""
    import subprocess

    if not isinstance(args, list) or not args:
        return {"error": "args must be a non-empty list"}

    cmd = ["oc"] + [str(a) for a in args]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
        )
    except FileNotFoundError:
        return {"error": "oc CLI not found in PATH"}
    except subprocess.TimeoutExpired:
        return {"error": "command timed out after 60 s"}

    return {
        "exit_code": result.returncode,
        "stdout": result.stdout[:10_000],
        "stderr": result.stderr[:2_000],
    }


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
