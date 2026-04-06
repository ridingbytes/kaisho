from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...backends import get_backend
from ...config import get_config
from ...services import settings as settings_svc
from ...services.advisor import ask, list_skills
from ...services.github import GhError, issues_for_customers

router = APIRouter(prefix="/api/advisor", tags=["advisor"])


class AskRequest(BaseModel):
    question: str
    model: str = "ollama:qwen3:14b"
    include_github: bool = False


@router.post("/ask")
def api_ask(body: AskRequest):
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="question is required")

    cfg = get_config()
    backend = get_backend()

    tasks = backend.tasks.list_tasks(include_done=False)
    clocks = backend.clocks.list_entries(period="month")
    inbox = backend.inbox.list_items()
    customers = backend.customers.list_customers()

    github_issues = []
    if body.include_github:
        try:
            github_issues = issues_for_customers(customers)
        except (GhError, FileNotFoundError):
            pass

    ai = settings_svc.get_ai_settings(
        settings_svc.load_settings(cfg.SETTINGS_FILE)
    )

    try:
        answer = ask(
            question=body.question,
            model_str=body.model,
            tasks=tasks,
            clock_entries=clocks,
            inbox_items=inbox,
            customers=customers,
            github_issues=github_issues,
            ollama_base_url=ai["ollama_url"],
            lm_studio_base_url=ai.get("lm_studio_url", ""),
            claude_api_key=ai.get("claude_api_key", ""),
            openrouter_base_url=ai.get(
                "openrouter_url", ""
            ),
            openrouter_api_key=ai.get(
                "openrouter_api_key", ""
            ),
            openai_base_url=ai.get("openai_url", ""),
            openai_api_key=ai.get("openai_api_key", ""),
            data_dir=str(cfg.DATA_DIR.expanduser()),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return {"answer": answer}


@router.get("/skills")
def get_skills():
    """List available advisor skills."""
    cfg = get_config()
    from pathlib import Path
    return list_skills(Path(str(cfg.DATA_DIR.expanduser())))
