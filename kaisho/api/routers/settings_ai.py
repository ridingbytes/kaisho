from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...config import get_config
from ...services import ai_providers
from ...services import settings as settings_svc

router = APIRouter(
    prefix="/api/settings", tags=["settings"],
)


class AiSettingsUpdate(BaseModel):
    ollama_url: str | None = None
    ollama_cloud_url: str | None = None
    ollama_api_key: str | None = None
    ollama_cloud_api_key: str | None = None
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
    """Return AI provider settings (secrets masked)."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    return settings_svc.get_ai_settings_safe(data)


@router.patch("/ai")
def update_ai(body: AiSettingsUpdate):
    """Update AI provider settings."""
    cfg = get_config()
    updates = body.model_dump(exclude_none=True)
    return settings_svc.set_ai_settings(
        cfg.SETTINGS_FILE, updates,
    )


@router.delete("/ai/keys/{field}")
def delete_ai_key(field: str):
    """Clear a single AI secret key.

    PATCH cannot do this because empty-string values are
    intentionally ignored (so users can submit forms
    without overwriting existing keys). This is the
    explicit "forget my key" action wired to the small X
    button next to a configured input.
    """
    cfg = get_config()
    try:
        return settings_svc.clear_ai_key(
            cfg.SETTINGS_FILE, field,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail=str(exc),
        )


@router.get("/ai/models")
def list_models():
    """List available AI models from all providers."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    ai = settings_svc.get_ai_settings(data)
    return {"models": ai_providers.list_models(ai)}


@router.get("/ai/claude_cli")
def get_claude_cli_status():
    """Check if the Claude CLI is installed."""
    return ai_providers.claude_cli_status()


@router.get("/ai/probe")
def probe_providers():
    """Check reachability of configured AI providers.

    Returns a dict with provider names as keys and
    boolean reachability as values.
    """
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    ai = settings_svc.get_ai_settings(data)
    return ai_providers.probe_providers(ai)
