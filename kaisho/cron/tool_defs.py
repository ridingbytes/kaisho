"""Tool definitions for the agentic executor (Anthropic format).

Each tool is a dict with ``name``, ``description``, and
``input_schema``.  ``openai_tools()`` in ``tools.py`` converts
these to the OpenAI / Ollama chat format on the fly.
"""

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
                    "description": (
                        "e.g. TODO, IN-PROGRESS, WAIT"
                        " (default: TODO)"
                    ),
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional tag names",
                },
                "body": {
                    "type": "string",
                    "description": (
                        "Task description/body text"
                    ),
                },
                "github_url": {
                    "type": "string",
                    "description": (
                        "GitHub issue or PR URL to "
                        "link to this task"
                    ),
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
        "description": (
            "Update a task's title, customer, body, "
            "or GitHub URL."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "title": {
                    "type": "string",
                    "description": (
                        "New title (optional)"
                    ),
                },
                "customer": {
                    "type": "string",
                    "description": (
                        "New customer (optional)"
                    ),
                },
                "body": {
                    "type": "string",
                    "description": (
                        "New body text (optional)"
                    ),
                },
                "github_url": {
                    "type": "string",
                    "description": (
                        "GitHub issue/PR URL "
                        "(optional)"
                    ),
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
        "input_schema": {
            "type": "object", "properties": {},
        },
    },
    {
        "name": "update_clock_entry",
        "description": (
            "Update a clock entry. Can change customer, "
            "description, contract, notes, or invoiced "
            "status. Identify the entry by its start "
            "ISO timestamp."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "start": {
                    "type": "string",
                    "description": (
                        "ISO start timestamp of the "
                        "entry to update"
                    ),
                },
                "customer": {
                    "type": "string",
                    "description": (
                        "New customer name (optional)"
                    ),
                },
                "description": {
                    "type": "string",
                    "description": (
                        "New description (optional)"
                    ),
                },
                "invoiced": {
                    "type": "boolean",
                    "description": (
                        "Mark as invoiced or not"
                    ),
                },
                "contract": {
                    "type": "string",
                    "description": (
                        "Contract name (optional)"
                    ),
                },
                "notes": {
                    "type": "string",
                    "description": (
                        "New notes (optional)"
                    ),
                },
            },
            "required": ["start"],
        },
    },
    {
        "name": "batch_invoice",
        "description": (
            "Mark all uninvoiced clock entries for a "
            "customer or contract as invoiced. Returns "
            "the number of entries marked."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "customer": {
                    "type": "string",
                    "description": "Customer name",
                },
                "contract": {
                    "type": "string",
                    "description": (
                        "Contract name (optional, "
                        "filters entries)"
                    ),
                },
            },
            "required": ["customer"],
        },
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
        "name": "write_kb_file",
        "description": (
            "Create or overwrite a file in the knowledge base. "
            "Use this when the user asks to create a knowledge "
            "base entry, KB article, or documentation page. "
            "Do NOT use add_note for knowledge base entries — "
            "use this tool instead. "
            "Requires a label (KB source name) and a filename."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "label": {
                    "type": "string",
                    "description": (
                        "Knowledge base source label, e.g. "
                        "'docs' or 'research'. Use "
                        "list_kb_files to discover labels."
                    ),
                },
                "filename": {
                    "type": "string",
                    "description": (
                        "File name including extension, "
                        "e.g. 'plone-zeoserver-settings.md'"
                    ),
                },
                "content": {
                    "type": "string",
                    "description": (
                        "File content (Markdown recommended)"
                    ),
                },
            },
            "required": ["label", "filename", "content"],
        },
    },
    {
        "name": "web_search",
        "description": (
            "Search the web using DuckDuckGo and return the "
            "top results with titles, URLs, and snippets. "
            "Use this when the user asks about external "
            "topics, URLs, packages, or anything that "
            "requires up-to-date web information. "
            "Follow up with fetch_url to read specific pages."
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
                    "description": (
                        "Max results to return (default 5)"
                    ),
                },
            },
            "required": ["query"],
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
    {
        "name": "get_time_insights",
        "description": (
            "Get time tracking insights: daily activity, "
            "billable vs non-billable split, and hours "
            "by customer. Use this to analyze how time "
            "was spent and give actionable advice on "
            "time allocation and priorities."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "period": {
                    "type": "string",
                    "enum": [
                        "week", "month",
                        "quarter", "year",
                    ],
                    "description": (
                        "Time period to analyze"
                    ),
                },
            },
            "required": ["period"],
        },
    },
    {
        "name": "list_cron_jobs",
        "description": (
            "List all defined cron jobs with their id, "
            "name, schedule, model, and enabled status. "
            "Use this to discover job IDs before "
            "triggering a job."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "trigger_cron_job",
        "description": (
            "Trigger a cron job to run immediately in the "
            "background. The job runs asynchronously — you "
            "cannot wait for or monitor the result. Simply "
            "confirm to the user that it was triggered and "
            "they can check results in the Cron view. "
            "Use list_cron_jobs first to find the job ID."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "job_id": {
                    "type": "string",
                    "description": "The cron job ID",
                },
            },
            "required": ["job_id"],
        },
    },
]
