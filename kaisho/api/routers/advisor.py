import json
import queue
import threading
from collections.abc import Generator
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
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


def _format_question_with_history(
    question: str, history: list[ChatMessage],
) -> str:
    """Prepend conversation history to the question."""
    if not history:
        return question
    lines = []
    for msg in history:
        role = (
            "User" if msg.role == "user"
            else "Assistant"
        )
        lines.append(f"{role}: {msg.text}")
    history_text = "\n\n".join(lines)
    return (
        f"## Conversation so far\n\n"
        f"{history_text}\n\n"
        f"## Current request\n\n"
        f"{question}"
    )


def _collect_advisor_context(backend) -> dict:
    """Gather tasks, clocks, inbox, customers for the
    advisor prompt."""
    return {
        "tasks": backend.tasks.list_tasks(
            include_done=False,
        ),
        "clock_entries": backend.clocks.list_entries(
            period="month",
        ),
        "inbox_items": backend.inbox.list_items(),
        "customers": (
            backend.customers.list_customers()
        ),
    }


def _ai_provider_kwargs(ai: dict) -> dict:
    """Extract AI provider connection settings."""
    return {
        "ollama_base_url": ai["ollama_url"],
        "ollama_api_key": ai.get(
            "ollama_api_key", "",
        ),
        "lm_studio_base_url": ai.get(
            "lm_studio_url", "",
        ),
        "claude_api_key": ai.get("claude_api_key", ""),
        "openrouter_base_url": ai.get(
            "openrouter_url", "",
        ),
        "openrouter_api_key": ai.get(
            "openrouter_api_key", "",
        ),
        "openai_base_url": ai.get("openai_url", ""),
        "openai_api_key": ai.get("openai_api_key", ""),
    }


def _sse_line(event: str, data: dict[str, Any]) -> str:
    """Format a single SSE event line."""
    payload = json.dumps(data, default=str)
    return f"event: {event}\ndata: {payload}\n\n"


_SENTINEL = object()


def _stream_ask(body: AskRequest) -> Generator[
    str, None, None,
]:
    """Run the advisor in a thread, yield SSE events."""
    cfg = get_config()
    backend = get_backend()

    ctx = _collect_advisor_context(backend)
    github_issues: list[dict] = []
    if body.include_github:
        try:
            github_issues = issues_for_customers(
                ctx["customers"],
            )
        except (GhError, FileNotFoundError):
            pass

    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    ai = settings_svc.get_ai_settings(data)
    sync = data.get("cloud_sync", {})
    use_cloud = sync.get("use_cloud_ai", False)
    cloud_url = sync.get("url", "")
    cloud_key = sync.get("api_key", "")

    from ...config import load_user_yaml
    user_meta = load_user_yaml(cfg)

    # When Cloud AI is enabled, override the model
    model_str = (
        "kaisho:default"
        if use_cloud and cloud_url and cloud_key
        else body.model
    )

    question = _format_question_with_history(
        body.question, body.history,
    )

    q: queue.Queue = queue.Queue()

    def on_event(
        event_type: str, data: dict[str, Any],
    ) -> None:
        q.put((event_type, data))

    # Emit the resolved model so the UI can display it
    q.put(("model", {"model": model_str}))

    def run() -> None:
        try:
            answer = ask(
                question=question,
                model_str=model_str,
                **ctx,
                github_issues=github_issues,
                **_ai_provider_kwargs(ai),
                cloud_url=cloud_url,
                cloud_api_key=cloud_key,
                data_dir=str(cfg.PROFILE_DIR),
                user_meta=user_meta,
                on_event=on_event,
            )
            q.put(("answer", {"answer": answer}))
        except Exception as exc:
            q.put(("error", {"detail": str(exc)}))
        finally:
            q.put(_SENTINEL)

    thread = threading.Thread(target=run, daemon=True)
    thread.start()

    while True:
        item = q.get()
        if item is _SENTINEL:
            break
        evt_type, evt_data = item
        yield _sse_line(evt_type, evt_data)


@router.post("/ask")
def api_ask(body: AskRequest):
    """Ask the AI advisor a question (SSE stream)."""
    if not body.question.strip():
        raise HTTPException(
            status_code=400,
            detail="question is required",
        )
    return StreamingResponse(
        _stream_ask(body),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/skills")
def get_skills():
    """List available advisor skills."""
    cfg = get_config()
    return list_skills(Path(str(cfg.PROFILE_DIR)))


class SkillBody(BaseModel):
    name: str
    content: str


@router.post("/skills")
def create_skill(body: SkillBody):
    """Create a new advisor skill."""
    cfg = get_config()
    data_dir = Path(str(cfg.PROFILE_DIR))
    return save_skill(data_dir, body.name, body.content)


@router.put("/skills/{name}")
def update_skill(name: str, body: SkillBody):
    """Update an existing advisor skill."""
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
    cfg = get_config()
    data_dir = Path(str(cfg.PROFILE_DIR))
    skill_path = data_dir / "SKILLS" / f"{name}.md"
    if not skill_path.exists():
        raise HTTPException(
            status_code=404, detail=f"Skill {name!r} not found"
        )
    delete_skill(data_dir, name)
    return {"ok": True}
