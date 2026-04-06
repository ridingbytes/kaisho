from pathlib import Path

import yaml

DEFAULT_CUSTOMER_TYPES: list[str] = [
    "LEAD", "CLIENT", "PROSPECT", "PARTNER",
]

DEFAULT_AI: dict = {
    "ollama_url": "http://localhost:11434",
    "lm_studio_url": "http://localhost:1234",
    "claude_api_key": "",
    "openrouter_url": "https://openrouter.ai/api/v1",
    "openrouter_api_key": "",
    "openai_url": "https://api.openai.com/v1",
    "openai_api_key": "",
    "advisor_model": "ollama:qwen3:14b",
    "cron_model": "ollama:qwen3:14b",
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
    """Return KB source list with defaults from config.

    Each entry: {"label": str, "path": str}.
    Falls back to WISSEN_DIR/RESEARCH_DIR from config if no
    custom sources are defined in settings.
    """
    sources = settings.get("kb_sources")
    if sources:
        return sources
    if cfg is None:
        from ..config import get_config
        cfg = get_config()
    return [
        {
            "label": "wissen",
            "path": str(cfg.WISSEN_DIR),
        },
        {
            "label": "research",
            "path": str(cfg.RESEARCH_DIR),
        },
    ]


def set_kb_sources(path: Path, sources: list[dict]) -> list[dict]:
    """Persist KB sources; return the updated list."""
    data = load_settings(path)
    data["kb_sources"] = sources
    save_settings(path, data)
    return sources


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
