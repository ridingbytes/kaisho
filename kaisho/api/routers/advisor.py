from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...backends import get_backend
from ...config import get_config
from ...services import settings as settings_svc
from ...services.advisor import ask, delete_skill, list_skills, save_skill
from ...services.github import GhError, issues_for_customers

router = APIRouter(prefix="/api/advisor", tags=["advisor"])


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    text: str


class AskRequest(BaseModel):
    question: str
    model: str = "ollama:qwen3:14b"
    include_github: bool = False
    history: list[ChatMessage] = []


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

    from ...config import load_user_yaml
    user_meta = load_user_yaml(cfg)

    # Build question with conversation history
    question = body.question
    if body.history:
        history_lines = []
        for msg in body.history:
            role = "User" if msg.role == "user" else "Assistant"
            history_lines.append(
                f"{role}: {msg.text}"
            )
        history_text = "\n\n".join(history_lines)
        question = (
            f"## Conversation so far\n\n"
            f"{history_text}\n\n"
            f"## Current request\n\n"
            f"{body.question}"
        )

    try:
        answer = ask(
            question=question,
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
            data_dir=str(cfg.PROFILE_DIR),
            user_meta=user_meta,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return {"answer": answer}


@router.get("/skills")
def get_skills():
    """List available advisor skills."""
    cfg = get_config()
    from pathlib import Path
    return list_skills(Path(str(cfg.PROFILE_DIR)))


class SkillBody(BaseModel):
    name: str
    content: str


@router.post("/skills")
def create_skill(body: SkillBody):
    """Create a new advisor skill."""
    from pathlib import Path
    cfg = get_config()
    data_dir = Path(str(cfg.PROFILE_DIR))
    return save_skill(data_dir, body.name, body.content)


@router.put("/skills/{name}")
def update_skill(name: str, body: SkillBody):
    """Update an existing advisor skill."""
    from pathlib import Path
    cfg = get_config()
    data_dir = Path(str(cfg.PROFILE_DIR))
    skill_path = data_dir / "SKILLS" / f"{name}.md"
    if not skill_path.exists():
        raise HTTPException(
            status_code=404, detail=f"Skill {name!r} not found"
        )
    return save_skill(data_dir, name, body.content)


@router.delete("/skills/{name}")
def remove_skill(name: str):
    """Delete an advisor skill."""
    from pathlib import Path
    cfg = get_config()
    data_dir = Path(str(cfg.PROFILE_DIR))
    skill_path = data_dir / "SKILLS" / f"{name}.md"
    if not skill_path.exists():
        raise HTTPException(
            status_code=404, detail=f"Skill {name!r} not found"
        )
    delete_skill(data_dir, name)
    return {"ok": True}
