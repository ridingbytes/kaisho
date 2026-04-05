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
