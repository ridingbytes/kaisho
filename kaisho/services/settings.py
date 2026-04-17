from pathlib import Path

import yaml

DEFAULT_CUSTOMER_TYPES: list[str] = [
    "LEAD", "CLIENT", "PROSPECT", "PARTNER", "INTERN",
]

DEFAULT_INBOX_TYPES: list[str] = [
    "NOTE", "EMAIL", "LEAD", "IDEA",
    "BUG", "FEATURE",
]

DEFAULT_INBOX_CHANNELS: list[str] = [
    "email", "phone", "chat", "meeting",
    "github", "slack",
]

DEFAULT_AI: dict = {
    "ollama_url": "http://localhost:11434",
    "lm_studio_url": "http://localhost:1234",
    "claude_api_key": "",
    "openrouter_url": "https://openrouter.ai/api/v1",
    "openrouter_api_key": "",
    "openai_url": "https://api.openai.com/v1",
    "openai_api_key": "",
    "brave_api_key": "",
    "tavily_api_key": "",
    "advisor_model": "",
    "cron_model": "",
}


def load_settings(path: Path) -> dict:
    """Load settings from a YAML file."""
    if not path.exists():
        return {"task_states": [], "tags": []}
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def save_settings(path: Path, settings: dict) -> None:
    """Save settings to a YAML file."""
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(settings, f, allow_unicode=True, default_flow_style=False)


def get_task_states(settings: dict) -> list[dict]:
    """Return task_states list from settings."""
    return settings.get("task_states", [])


def get_tags(settings: dict) -> list[dict]:
    """Return tags list from settings."""
    return settings.get("tags", [])


def get_state_names(settings: dict) -> list[str]:
    """Return list of all state names."""
    return [s["name"] for s in get_task_states(settings)]


def get_done_state_names(settings: dict) -> list[str]:
    """Return list of state names marked as done."""
    return [
        s["name"]
        for s in get_task_states(settings)
        if s.get("done", False)
    ]


def get_customer_types(settings: dict) -> list[str]:
    """Return customer_types list with defaults."""
    return settings.get("customer_types", list(DEFAULT_CUSTOMER_TYPES))


def get_inbox_types(settings: dict) -> list[str]:
    """Return inbox_types list with defaults."""
    return settings.get(
        "inbox_types", list(DEFAULT_INBOX_TYPES),
    )


def get_inbox_channels(settings: dict) -> list[str]:
    """Return inbox_channels list with defaults."""
    return settings.get(
        "inbox_channels",
        list(DEFAULT_INBOX_CHANNELS),
    )


def get_ai_settings(settings: dict) -> dict:
    """Return AI settings with defaults filled in."""
    return {**DEFAULT_AI, **settings.get("ai", {})}


def set_ai_settings(path: Path, updates: dict) -> dict:
    """Persist AI settings updates; return the new full ai block."""
    data = load_settings(path)
    ai = data.get("ai", {})
    ai.update(updates)
    data["ai"] = ai
    save_settings(path, data)
    return get_ai_settings(data)


DEFAULT_CLOUD_SYNC: dict = {
    "enabled": False,
    "url": "https://cloud.kaisho.dev",
    "api_key": "",
    "interval": 300,
    # When True, the advisor/cron system routes AI
    # requests through the cloud gateway instead of
    # the locally configured model (ollama, etc.).
    # Requires the sync_ai plan.
    "use_cloud_ai": False,
}


def get_cloud_sync_settings(settings: dict) -> dict:
    """Return cloud sync settings with defaults."""
    raw = {
        **DEFAULT_CLOUD_SYNC,
        **settings.get("cloud_sync", {}),
    }
    return {
        "enabled": raw["enabled"],
        "url": raw["url"],
        "api_key_set": bool(raw.get("api_key")),
        "interval": raw["interval"],
        "use_cloud_ai": raw.get("use_cloud_ai", False),
    }


def get_cloud_sync_key(settings: dict) -> str:
    """Return the raw cloud sync API key."""
    return settings.get("cloud_sync", {}).get(
        "api_key", "",
    )


def set_cloud_sync_settings(
    path: Path, updates: dict,
) -> dict:
    """Persist cloud sync settings; return new block."""
    data = load_settings(path)
    sync = data.get("cloud_sync", {})
    sync.update(updates)
    data["cloud_sync"] = sync
    save_settings(path, data)
    return get_cloud_sync_settings(data)


DEFAULT_BACKUP: dict = {
    # Empty string -> resolve to DATA_DIR / "backups" at
    # runtime via resolve_backup_dir().
    "directory": "",
    "keep": 10,
    # 0 disables the scheduled backup job.
    "interval_hours": 24,
}


def get_backup_settings(settings: dict) -> dict:
    """Return backup settings with defaults filled in."""
    return {
        **DEFAULT_BACKUP, **settings.get("backup", {}),
    }


def set_backup_settings(
    path: Path, updates: dict,
) -> dict:
    """Persist backup settings updates; return the new block."""
    data = load_settings(path)
    block = data.get("backup", {})
    block.update(updates)
    data["backup"] = block
    save_settings(path, data)
    return get_backup_settings(data)


def resolve_backup_dir(settings: dict, cfg=None) -> Path:
    """Return the absolute backup directory path.

    Uses ``backup.directory`` from settings when set,
    otherwise ``DATA_DIR / "backups"``.
    """
    if cfg is None:
        from ..config import get_config
        cfg = get_config()
    raw = get_backup_settings(settings).get(
        "directory", "",
    )
    if raw:
        return Path(raw).expanduser()
    return cfg.DATA_DIR / "backups"


DEFAULT_INVOICE_EXPORT: dict = {
    "columns": [
        {"field": "date"},
        {"field": "start_time"},
        {"field": "end_time"},
        {"field": "customer"},
        {"field": "description"},
        {"field": "contract"},
        {"field": "task"},
        {"field": "hours"},
    ],
}


def get_invoice_export_settings(settings: dict) -> dict:
    """Return invoice export column config."""
    return {
        **DEFAULT_INVOICE_EXPORT,
        **settings.get("invoice_export", {}),
    }


def set_invoice_export_settings(
    path: Path, updates: dict,
) -> dict:
    """Persist invoice export settings."""
    data = load_settings(path)
    exp = data.get("invoice_export", {})
    exp.update(updates)
    data["invoice_export"] = exp
    save_settings(path, data)
    return get_invoice_export_settings(data)


DEFAULT_GITHUB: dict = {
    "token": "",
    "base_url": "https://api.github.com",
}


def get_github_settings(settings: dict) -> dict:
    """Return GitHub settings with defaults filled in."""
    return {**DEFAULT_GITHUB, **settings.get("github", {})}


def set_github_settings(path: Path, updates: dict) -> dict:
    """Persist GitHub settings updates; return the new full block."""
    data = load_settings(path)
    gh = data.get("github", {})
    gh.update(updates)
    data["github"] = gh
    save_settings(path, data)
    return get_github_settings(data)


def get_kb_sources(settings: dict, cfg=None) -> list[dict]:
    """Return KB source list with defaults.

    Each entry: {"label": str, "path": str}.
    Default: a "knowledge" folder in the user's data dir,
    plus KNOWLEDGE_DIR/RESEARCH_DIR from config.
    """
    sources = settings.get("kb_sources")
    if sources:
        return sources
    if cfg is None:
        from ..config import get_config
        cfg = get_config()
    # Default KB in user's data dir (shared across profiles)
    user_kb = cfg.DATA_DIR / "knowledge"
    user_kb.mkdir(parents=True, exist_ok=True)
    defaults = [
        {
            "label": "knowledge",
            "path": str(user_kb),
        },
    ]
    # Add legacy dirs if they exist
    for label, path_attr in [
        ("knowledge", cfg.KNOWLEDGE_DIR),
        ("research", cfg.RESEARCH_DIR),
    ]:
        p = path_attr.expanduser()
        if p.is_dir():
            defaults.append({
                "label": label,
                "path": str(p),
            })
    return defaults


def set_kb_sources(path: Path, sources: list[dict]) -> list[dict]:
    """Persist KB sources; return the updated list."""
    data = load_settings(path)
    data["kb_sources"] = sources
    save_settings(path, data)
    return sources


DEFAULT_PATHS: dict = {
    "backend": "org",
    "org_dir": "",
    "markdown_dir": "",
    "json_dir": "",
    "sql_dsn": "",
}


def _default_org_dir(cfg) -> str:
    """Profile-local org dir, unless an explicit env override exists."""
    from pathlib import Path
    builtin = Path("data/org").expanduser()
    if cfg.ORG_DIR.expanduser() != builtin:
        return str(cfg.ORG_DIR.expanduser())
    return str(cfg.PROFILE_DIR / "org")


def _default_markdown_dir(cfg) -> str:
    """Profile-local markdown dir."""
    from pathlib import Path
    builtin = Path("data/markdown").expanduser()
    if cfg.MARKDOWN_DIR.expanduser() != builtin:
        return str(cfg.MARKDOWN_DIR.expanduser())
    return str(cfg.PROFILE_DIR / "markdown")


def _default_json_dir(cfg) -> str:
    """Profile-local JSON dir."""
    from pathlib import Path
    builtin = Path("data/json").expanduser()
    if cfg.JSON_DIR.expanduser() != builtin:
        return str(cfg.JSON_DIR.expanduser())
    return str(cfg.PROFILE_DIR / "json")


def get_path_settings(settings: dict, cfg=None) -> dict:
    """Return backend/path settings with defaults.

    Keys: backend, org_dir, markdown_dir, json_dir.
    Each defaults to a subdirectory inside PROFILE_DIR
    so each profile keeps its data isolated.
    """
    if cfg is None:
        from ..config import get_config
        cfg = get_config()
    stored = settings.get("paths", {})
    return {
        "backend": (
            stored.get("backend") or cfg.BACKEND
        ),
        "org_dir": (
            stored.get("org_dir")
            or _default_org_dir(cfg)
        ),
        "markdown_dir": (
            stored.get("markdown_dir")
            or _default_markdown_dir(cfg)
        ),
        "json_dir": (
            stored.get("json_dir")
            or _default_json_dir(cfg)
        ),
        "sql_dsn": stored.get("sql_dsn", ""),
    }


def set_path_settings(
    path: Path, updates: dict,
) -> dict:
    """Persist path/backend settings."""
    data = load_settings(path)
    paths = data.get("paths", {})
    for key in (
        "backend", "org_dir",
        "markdown_dir", "json_dir", "sql_dsn",
    ):
        if key in updates and updates[key] is not None:
            paths[key] = updates[key]
    data["paths"] = paths
    save_settings(path, data)
    return get_path_settings(data)


def get_url_allowlist(settings: dict) -> list[str]:
    """Return the URL allowlist (list of domain strings)."""
    return settings.get("url_allowlist", [])


def add_to_url_allowlist(path: Path, domain: str) -> list[str]:
    """Add a domain to the URL allowlist and return the list."""
    data = load_settings(path)
    allowlist = data.get("url_allowlist", [])
    if domain not in allowlist:
        allowlist.append(domain)
    data["url_allowlist"] = allowlist
    save_settings(path, data)
    return allowlist
