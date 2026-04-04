from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...backends import get_backend
from ...config import get_config
from ...services.advisor import ask
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
    clocks = backend.clocks.list_entries(limit=30)
    inbox = backend.inbox.list_items()
    customers = backend.customers.list_customers()

    github_issues = []
    if body.include_github:
        try:
            github_issues = issues_for_customers(customers)
        except (GhError, FileNotFoundError):
            pass

    try:
        answer = ask(
            question=body.question,
            model_str=body.model,
            tasks=tasks,
            clock_entries=clocks,
            inbox_items=inbox,
            customers=customers,
            github_issues=github_issues,
            ollama_base_url=cfg.OLLAMA_BASE_URL,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return {"answer": answer}
