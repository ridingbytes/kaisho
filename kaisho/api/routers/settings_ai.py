import json
import urllib.request
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from ...config import get_config
from ...services import settings as settings_svc

router = APIRouter(
    prefix="/api/settings", tags=["settings"],
)


def _claude_cli_status() -> dict:
    """Check if claude CLI is installed and authenticated."""
    import shutil
    import subprocess
    path = shutil.which("claude")
    if not path:
        return {
            "installed": False,
            "authenticated": False,
            "version": "",
            "path": "",
        }
    try:
        result = subprocess.run(
            [path, "--version"],
            capture_output=True, text=True, timeout=5,
        )
        version = result.stdout.strip().split("\n")[0]
    except (OSError, subprocess.SubprocessError):
        version = "unknown"
    creds = Path.home() / ".claude"
    authenticated = creds.is_dir() and any(
        creds.iterdir()
    )
    return {
        "installed": True,
        "authenticated": authenticated,
        "version": version,
        "path": path,
        "note": (
            "Claude CLI subscription no longer supports "
            "tool calls (since April 2025). Use Ollama "
            "or the Claude API with an API key instead."
        ),
    }


_CLAUDE_API_MODELS = [
    "claude:claude-opus-4-6",
    "claude:claude-sonnet-4-6",
    "claude:claude-haiku-4-5-20251001",
]

_CLAUDE_CLI_MODELS: list[str] = []


def _fetch_ollama_models(base_url: str) -> list[str]:
    """Fetch available model names from Ollama."""
    url = base_url.rstrip("/") + "/api/tags"
    try:
        with urllib.request.urlopen(
            url, timeout=3,
        ) as resp:
            data = json.loads(resp.read())
        return [
            f"ollama:{m['name']}"
            for m in data.get("models", [])
        ]
    except (urllib.error.URLError, OSError, KeyError):
        return []


def _fetch_lm_studio_models(
    base_url: str,
) -> list[str]:
    """Fetch available model names from LM Studio."""
    if not base_url:
        return []
    url = base_url.rstrip("/") + "/v1/models"
    try:
        with urllib.request.urlopen(
            url, timeout=3,
        ) as resp:
            data = json.loads(resp.read())
        return [
            f"lm_studio:{m['id']}"
            for m in data.get("data", [])
        ]
    except (urllib.error.URLError, OSError, KeyError):
        return []


def _fetch_openai_compatible_models(
    base_url: str, api_key: str, prefix: str,
) -> list[str]:
    """Fetch models from an OpenAI-compatible endpoint."""
    if not base_url:
        return []
    url = base_url.rstrip("/") + "/models"
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(
            req, timeout=5,
        ) as resp:
            data = json.loads(resp.read())
        return [
            f"{prefix}:{m['id']}"
            for m in data.get("data", [])
        ]
    except (urllib.error.URLError, OSError, KeyError):
        return []


class AiSettingsUpdate(BaseModel):
    ollama_url: str | None = None
    lm_studio_url: str | None = None
    claude_api_key: str | None = None
    openrouter_url: str | None = None
    openrouter_api_key: str | None = None
    openai_url: str | None = None
    openai_api_key: str | None = None
    brave_api_key: str | None = None
    tavily_api_key: str | None = None
    advisor_model: str | None = None
    cron_model: str | None = None


@router.get("/ai")
def get_ai():
    """Return AI provider settings."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    return settings_svc.get_ai_settings(data)


@router.patch("/ai")
def update_ai(body: AiSettingsUpdate):
    """Update AI provider settings."""
    cfg = get_config()
    updates = body.model_dump(exclude_none=True)
    return settings_svc.set_ai_settings(
        cfg.SETTINGS_FILE, updates,
    )


@router.get("/ai/models")
def list_models():
    """List available AI models from all providers."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    ai = settings_svc.get_ai_settings(data)
    models = (
        _fetch_ollama_models(ai["ollama_url"])
        + _fetch_lm_studio_models(
            ai.get("lm_studio_url", ""),
        )
        + _fetch_openai_compatible_models(
            ai.get("openrouter_url", ""),
            ai.get("openrouter_api_key", ""),
            "openrouter",
        )
        + _fetch_openai_compatible_models(
            ai.get("openai_url", ""),
            ai.get("openai_api_key", ""),
            "openai",
        )
        + _CLAUDE_CLI_MODELS
        + _CLAUDE_API_MODELS
    )
    return {"models": models}


@router.get("/ai/claude_cli")
def get_claude_cli_status():
    """Check if the Claude CLI is installed."""
    return _claude_cli_status()
