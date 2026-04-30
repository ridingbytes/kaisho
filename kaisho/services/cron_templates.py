"""Cron template registry.

Templates are the rows in ``templates/jobs.yaml`` plus the
prompt file referenced by each. They are surfaced by the
desktop's "New from template" picker and by the advisor's
``create_cron_from_template`` MCP tool so users can stamp
out a working cron job without writing a prompt or knowing
about ``fetch:`` frontmatter.
"""
from pathlib import Path

import yaml


def _project_root() -> Path:
    """Return the kaisho project root (repo top-level)."""
    return Path(__file__).resolve().parent.parent.parent


def _templates_file() -> Path:
    return _project_root() / "templates" / "jobs.yaml"


def _read_prompt(prompt_file: str) -> str:
    """Read prompt body relative to project root. Returns
    empty string if the file is missing rather than
    raising — the API caller can still see the metadata."""
    path = _project_root() / prompt_file
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def list_cron_templates() -> list[dict]:
    """Return the list of cron templates with metadata
    and prompt body. Each entry is suitable for rendering
    in the desktop picker."""
    raw = _templates_file().read_text(encoding="utf-8")
    data = yaml.safe_load(raw) or {}
    jobs = data.get("jobs", []) or []
    return [_to_template(job) for job in jobs]


def get_cron_template(template_id: str) -> dict | None:
    """Return a single template by id, or None."""
    for tpl in list_cron_templates():
        if tpl["id"] == template_id:
            return tpl
    return None


def _to_template(job: dict) -> dict:
    """Project a jobs.yaml row into the template DTO the
    API and MCP tool consume."""
    prompt = _read_prompt(job.get("prompt_file", ""))
    return {
        "id": job.get("id", ""),
        "name": job.get("name", ""),
        "description": (
            job.get("description", "") or ""
        ).strip(),
        "category": job.get("category", "other"),
        "requires_tools": bool(
            job.get("requires_tools", False),
        ),
        "default_schedule": job.get("schedule", ""),
        "default_model": job.get(
            "model", "kaisho:cron",
        ),
        "default_output": job.get("output", "inbox"),
        "default_timeout": int(
            job.get("timeout", 600),
        ),
        "prompt_file": job.get("prompt_file", ""),
        "prompt": prompt,
    }
