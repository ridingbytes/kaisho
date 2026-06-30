"""AI provider discovery and reachability probing.

Network-touching logic extracted from the settings_ai
router so the router stays a thin request/response shim.
"""
import json
import urllib.error
import urllib.request
from pathlib import Path

CLAUDE_API_MODELS = [
    "claude:claude-opus-4-6",
    "claude:claude-sonnet-4-6",
    "claude:claude-haiku-4-5-20251001",
]


def claude_cli_status() -> dict:
    """Check if the claude CLI is installed/authenticated."""
    import shutil
    import subprocess

    from ..subproc import run as _run
    path = shutil.which("claude")
    if not path:
        return {
            "installed": False,
            "authenticated": False,
            "version": "",
            "path": "",
        }
    try:
        result = _run(
            [path, "--version"],
            capture_output=True, text=True, timeout=5,
        )
        version = result.stdout.strip().split("\n")[0]
    except (OSError, subprocess.SubprocessError):
        version = "unknown"
    creds = Path.home() / ".claude"
    authenticated = creds.is_dir() and any(creds.iterdir())
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


def _fetch_openai_compatible_models(
    base_url: str, api_key: str, prefix: str,
) -> list[str]:
    """Fetch models from an OpenAI-compatible endpoint."""
    if not base_url or not api_key:
        return []
    base = base_url.rstrip("/")
    # Use /v1/models unless the URL already ends in /v1.
    url = (
        base + "/models" if base.endswith("/v1")
        else base + "/v1/models"
    )
    headers = {"Authorization": f"Bearer {api_key}"}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        return [
            f"{prefix}:{m['id']}"
            for m in data.get("data", [])
        ]
    except (
        urllib.error.URLError, OSError, KeyError, ValueError,
    ):
        return []


def _fetch_ollama_models(base_url: str) -> list[str]:
    """Fetch model names from a *local* Ollama via the
    native ``/api/tags`` endpoint. Remote URLs should use
    ``ollama_cloud_url`` instead and are skipped."""
    if not base_url:
        return []
    lower = base_url.lower()
    if not ("localhost" in lower or "127.0.0.1" in lower):
        return []
    url = base_url.rstrip("/") + "/api/tags"
    try:
        with urllib.request.urlopen(url, timeout=3) as resp:
            data = json.loads(resp.read())
        return [
            f"ollama:{m['name']}"
            for m in data.get("models", [])
        ]
    except (
        urllib.error.URLError, OSError, KeyError, ValueError,
    ):
        return []


def _fetch_ollama_cloud_models(
    base_url: str, api_key: str,
) -> list[str]:
    """Fetch model names from Ollama Cloud (OpenAI-compat)."""
    if not base_url or not api_key:
        return []
    return _fetch_openai_compatible_models(
        base_url, api_key, "ollama_cloud",
    )


def _fetch_lm_studio_models(base_url: str) -> list[str]:
    """Fetch model names from LM Studio."""
    if not base_url:
        return []
    url = base_url.rstrip("/") + "/v1/models"
    try:
        with urllib.request.urlopen(url, timeout=3) as resp:
            data = json.loads(resp.read())
        return [
            f"lm_studio:{m['id']}"
            for m in data.get("data", [])
        ]
    except (
        urllib.error.URLError, OSError, KeyError, ValueError,
    ):
        return []


def list_models(ai: dict) -> list[str]:
    """Aggregate available models across all configured
    providers given the AI settings block."""
    models: list[str] = []
    models += _fetch_ollama_models(ai.get("ollama_url", ""))
    models += _fetch_ollama_cloud_models(
        ai.get("ollama_cloud_url", ""),
        ai.get("ollama_cloud_api_key", ""),
    )
    models += _fetch_lm_studio_models(
        ai.get("lm_studio_url", ""),
    )
    models += _fetch_openai_compatible_models(
        ai.get("openrouter_url", ""),
        ai.get("openrouter_api_key", ""),
        "openrouter",
    )
    models += _fetch_openai_compatible_models(
        ai.get("openai_url", ""),
        ai.get("openai_api_key", ""),
        "openai",
    )
    if ai.get("claude_api_key"):
        models += CLAUDE_API_MODELS
    return models


def _probe_url(
    url: str, api_key: str = "", timeout: int = 3,
) -> bool:
    """Check if a URL is reachable."""
    if not url:
        return False
    try:
        req = urllib.request.Request(url, method="GET")
        if api_key:
            req.add_header(
                "Authorization", f"Bearer {api_key}",
            )
        urllib.request.urlopen(req, timeout=timeout)
        return True
    except (OSError, ValueError):
        return False


def probe_providers(ai: dict) -> dict:
    """Reachability of each configured AI provider."""
    return {
        "ollama": _probe_url(ai.get("ollama_url", "")),
        "ollama_cloud": bool(
            ai.get("ollama_cloud_url")
            and ai.get("ollama_cloud_api_key")
        ),
        "lm_studio": _probe_url(ai.get("lm_studio_url", "")),
        "openrouter": bool(ai.get("openrouter_api_key")),
        "openai": bool(ai.get("openai_api_key")),
        "claude": bool(ai.get("claude_api_key")),
    }
