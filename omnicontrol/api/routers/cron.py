from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from ...config import get_config
from ...cron.executor import ExecutorError, execute_job
from ...services import settings as settings_svc
from ...services.cron import (
    add_job,
    delete_job,
    finish_run,
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


def _db() -> Path:
    return get_config().DB_FILE


def _project_root() -> Path:
    return Path(__file__).parent.parent.parent.parent


class JobCreate(BaseModel):
    id: str
    name: str
    schedule: str
    model: str = "ollama:qwen3:14b"
    prompt_file: str
    output: str
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


@router.get("/jobs")
def api_list_jobs():
    return list_jobs(_jobs_file())


@router.get("/jobs/{job_id}")
def api_get_job(job_id: str):
    job = get_job(_jobs_file(), job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/jobs", status_code=201)
def api_add_job(body: JobCreate):
    try:
        return add_job(_jobs_file(), body.model_dump())
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
        )
        finish_run(_db(), run_id, "ok", output=output[:4000])
    except ExecutorError as exc:
        finish_run(_db(), run_id, "error", error=str(exc))
    except Exception as exc:
        finish_run(_db(), run_id, "error", error=str(exc))
        raise


@router.post("/jobs/{job_id}/trigger", status_code=202)
def api_trigger_job(job_id: str, background_tasks: BackgroundTasks):
    job = get_job(_jobs_file(), job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    run_id = start_run(_db(), job_id)
    background_tasks.add_task(_run_job_bg, job, run_id)
    return {"run_id": run_id, "status": "running"}


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

@router.get("/history")
def api_list_history(job_id: str | None = None, limit: int = 50):
    return list_history(_db(), job_id=job_id, limit=limit)


@router.get("/history/{entry_id}")
def api_get_history(entry_id: int):
    from ...services.cron import get_history_entry
    record = get_history_entry(_db(), entry_id)
    if record is None:
        raise HTTPException(status_code=404, detail="History entry not found")
    return record
