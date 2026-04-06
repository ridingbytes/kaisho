from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from ...backends import get_backend
from ...config import get_config
from ...cron.executor import ExecutorError, execute_job, load_prompt
from ...services import settings as settings_svc
from ...services.cron import (
    add_job,
    delete_history_entry,
    delete_job,
    finish_run,
    get_history_entry,
    get_job,
    list_history,
    list_jobs,
    set_enabled,
    start_run,
    update_job,
)

router = APIRouter(prefix="/api/cron", tags=["cron"])


def _jobs_file() -> Path:
    return get_config().JOBS_FILE


def _profile() -> Path:
    return get_config().PROFILE_DIR


def _project_root() -> Path:
    return Path(__file__).parent.parent.parent.parent


class JobCreate(BaseModel):
    id: str
    name: str
    schedule: str
    model: str = "ollama:qwen3:14b"
    prompt_file: str = ""
    prompt_content: str = ""
    output: str = "inbox"
    timeout: int = 120
    enabled: bool = True


class JobUpdate(BaseModel):
    name: str | None = None
    schedule: str | None = None
    model: str | None = None
    prompt_file: str | None = None
    output: str | None = None
    timeout: int | None = None
    enabled: bool | None = None


class PromptUpdate(BaseModel):
    content: str


@router.get("/jobs")
def api_list_jobs():
    return list_jobs(_jobs_file())


@router.get("/jobs/{job_id}")
def api_get_job(job_id: str):
    job = get_job(_jobs_file(), job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _write_prompt_file(job_id: str, content: str) -> str:
    """Write inline prompt content to prompts/<job_id>.md.

    Returns the relative path string stored in the job definition.
    """
    prompts_dir = _project_root() / "prompts"
    prompts_dir.mkdir(exist_ok=True)
    (prompts_dir / f"{job_id}.md").write_text(content, encoding="utf-8")
    return f"prompts/{job_id}.md"


@router.post("/jobs", status_code=201)
def api_add_job(body: JobCreate):
    data = body.model_dump()
    prompt_content = data.pop("prompt_content", "")

    if not data["prompt_file"] and prompt_content:
        data["prompt_file"] = _write_prompt_file(body.id, prompt_content)
    elif not data["prompt_file"]:
        # Create an empty placeholder so the job is runnable after editing
        data["prompt_file"] = _write_prompt_file(body.id, "")

    try:
        return add_job(_jobs_file(), data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/jobs/{job_id}")
def api_update_job(job_id: str, body: JobUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    try:
        return update_job(_jobs_file(), job_id, updates)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/jobs/{job_id}", status_code=204)
def api_delete_job(job_id: str):
    ok = delete_job(_jobs_file(), job_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Job not found")


@router.get("/jobs/{job_id}/prompt")
def api_get_prompt(job_id: str):
    job = get_job(_jobs_file(), job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        content = load_prompt(job["prompt_file"], _project_root())
    except ExecutorError as exc:
        return {"content": "", "path": job.get("prompt_file", ""), "error": str(exc)}
    return {"content": content, "path": job.get("prompt_file", "")}


@router.put("/jobs/{job_id}/prompt")
def api_update_prompt(job_id: str, body: PromptUpdate):
    job = get_job(_jobs_file(), job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    p = Path(job["prompt_file"])
    if not p.is_absolute():
        p = _project_root() / p
    p = p.expanduser()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(body.content, encoding="utf-8")
    return {"content": body.content, "path": job.get("prompt_file", "")}


@router.post("/jobs/{job_id}/enable")
def api_enable_job(job_id: str):
    try:
        return set_enabled(_jobs_file(), job_id, True)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/jobs/{job_id}/disable")
def api_disable_job(job_id: str):
    try:
        return set_enabled(_jobs_file(), job_id, False)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ---------------------------------------------------------------------------
# Trigger
# ---------------------------------------------------------------------------

def _run_job_bg(job: dict, run_id: int) -> None:
    cfg = get_config()
    ai = settings_svc.get_ai_settings(
        settings_svc.load_settings(cfg.SETTINGS_FILE)
    )
    try:
        output = execute_job(
            job,
            project_root=_project_root(),
            ollama_base_url=ai["ollama_url"],
            inbox_file=cfg.INBOX_FILE,
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
        )
        finish_run(_profile(), run_id, "ok", output=output[:4000])
    except ExecutorError as exc:
        finish_run(_profile(), run_id, "error", error=str(exc))
    except Exception as exc:
        finish_run(_profile(), run_id, "error", error=str(exc))
        raise


@router.post("/jobs/{job_id}/trigger", status_code=202)
def api_trigger_job(job_id: str, background_tasks: BackgroundTasks):
    job = get_job(_jobs_file(), job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    run_id = start_run(_profile(), job_id)
    background_tasks.add_task(_run_job_bg, job, run_id)
    return {"run_id": run_id, "status": "running"}


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

@router.get("/history")
def api_list_history(job_id: str | None = None, limit: int = 50):
    return list_history(_profile(), job_id=job_id, limit=limit)


@router.get("/history/{entry_id}")
def api_get_history(entry_id: int):
    record = get_history_entry(_profile(), entry_id)
    if record is None:
        raise HTTPException(
            status_code=404, detail="History entry not found"
        )
    return record


@router.delete("/history/{entry_id}", status_code=204)
def api_delete_history(entry_id: int):
    ok = delete_history_entry(_profile(), entry_id)
    if not ok:
        raise HTTPException(
            status_code=404, detail="History entry not found"
        )


# -------------------------------------------------------------------
# Move run output to task / note / KB
# -------------------------------------------------------------------

class MoveRunRequest(BaseModel):
    destination: str  # "todo" | "note" | "kb"
    customer: str | None = None
    filename: str | None = None


def _build_title(run: dict) -> str:
    """Build a title from a cron run record."""
    job_id = run.get("job_id", "cron")
    ts = run.get("started_at", "")[:10]
    return f"Cron: {job_id} ({ts})"


@router.post("/history/{entry_id}/move", status_code=201)
def api_move_run_output(entry_id: int, body: MoveRunRequest):
    run = get_history_entry(_profile(), entry_id)
    if run is None:
        raise HTTPException(
            status_code=404, detail="History entry not found"
        )

    output = run.get("output", "") or ""
    title = _build_title(run)
    cfg = get_config()

    if body.destination == "todo":
        if not body.customer:
            raise HTTPException(
                status_code=400,
                detail="customer required for destination=todo",
            )
        task = get_backend().tasks.add_task(
            customer=body.customer,
            title=title,
            status="TODO",
            body=output,
        )
        return task

    if body.destination == "note":
        note = get_backend().notes.add_note(
            title=title,
            body=output,
        )
        return note

    if body.destination == "kb":
        if not body.filename:
            raise HTTPException(
                status_code=400,
                detail="filename required for destination=kb",
            )
        if not body.filename.endswith(".md"):
            raise HTTPException(
                status_code=400,
                detail="filename must end with .md",
            )
        kb_dir = cfg.WISSEN_DIR.expanduser()
        kb_dir.mkdir(parents=True, exist_ok=True)
        dest = kb_dir / body.filename
        content = f"# {title}\n\n{output}\n"
        dest.write_text(content, encoding="utf-8")
        return {"path": str(dest)}

    raise HTTPException(
        status_code=400,
        detail="destination must be 'todo', 'note', or 'kb'",
    )
