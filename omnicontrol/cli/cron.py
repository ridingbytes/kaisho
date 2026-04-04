import json
import sys

import click

from ..config import get_config
from ..cron.executor import ExecutorError, execute_job
from ..services.cron import (
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

_PROJECT_ROOT = None


def _cfg():
    return get_config()


def _jobs_file():
    return _cfg().JOBS_FILE


def _db():
    return _cfg().DB_FILE


def _project_root():
    from pathlib import Path
    return Path(__file__).parent.parent.parent


@click.group("cron")
def cron_cmd():
    """Manage and run scheduled AI jobs."""


@cron_cmd.command("list")
@click.option("--json", "as_json", is_flag=True)
def cron_list(as_json):
    """List all defined cron jobs."""
    jobs = list_jobs(_jobs_file())
    if as_json:
        click.echo(json.dumps(jobs, default=str))
        return
    if not jobs:
        click.echo("No jobs defined.")
        return
    for j in jobs:
        status = "enabled" if j.get("enabled") else "disabled"
        click.echo(
            f"{j['id']:<30} {status:<10} {j.get('schedule', ''):<15}"
            f"  {j.get('name', '')}"
        )


@cron_cmd.command("show")
@click.argument("job_id")
@click.option("--json", "as_json", is_flag=True)
def cron_show(job_id, as_json):
    """Show full details of a cron job."""
    job = get_job(_jobs_file(), job_id)
    if job is None:
        click.echo(f"Job not found: {job_id}", err=True)
        sys.exit(1)
    if as_json:
        click.echo(json.dumps(job, default=str))
        return
    for key, val in job.items():
        click.echo(f"{key:<15} {val}")


@cron_cmd.command("enable")
@click.argument("job_id")
def cron_enable(job_id):
    """Enable a cron job."""
    try:
        set_enabled(_jobs_file(), job_id, True)
    except ValueError as e:
        click.echo(str(e), err=True)
        sys.exit(1)
    click.echo(f"Enabled: {job_id}")


@cron_cmd.command("disable")
@click.argument("job_id")
def cron_disable(job_id):
    """Disable a cron job."""
    try:
        set_enabled(_jobs_file(), job_id, False)
    except ValueError as e:
        click.echo(str(e), err=True)
        sys.exit(1)
    click.echo(f"Disabled: {job_id}")


@cron_cmd.command("trigger")
@click.argument("job_id")
@click.option("--json", "as_json", is_flag=True)
def cron_trigger(job_id, as_json):
    """Run a job immediately, regardless of schedule or enabled state."""
    job = get_job(_jobs_file(), job_id)
    if job is None:
        click.echo(f"Job not found: {job_id}", err=True)
        sys.exit(1)
    cfg = _cfg()
    run_id = start_run(_db(), job_id)
    click.echo(f"Running {job_id}...", err=True)
    try:
        output = execute_job(
            job,
            project_root=_project_root(),
            ollama_base_url=cfg.OLLAMA_BASE_URL,
            inbox_file=cfg.INBOX_FILE,
        )
        finish_run(_db(), run_id, "ok", output=output[:4000])
    except ExecutorError as exc:
        finish_run(_db(), run_id, "error", error=str(exc))
        click.echo(f"Error: {exc}", err=True)
        sys.exit(1)
    if as_json:
        click.echo(json.dumps({"run_id": run_id, "status": "ok"}))
    else:
        click.echo(f"Done. Run #{run_id} recorded.")


@cron_cmd.command("history")
@click.argument("job_id", required=False)
@click.option("--limit", default=20, show_default=True)
@click.option("--json", "as_json", is_flag=True)
def cron_history(job_id, limit, as_json):
    """Show execution history (optionally filtered by job id)."""
    records = list_history(_db(), job_id=job_id, limit=limit)
    if as_json:
        click.echo(json.dumps(records, default=str))
        return
    if not records:
        click.echo("No history found.")
        return
    for r in records:
        started = r["started_at"][:16].replace("T", " ")
        finished = (r["finished_at"] or "")[:16].replace("T", " ")
        err = f"  ERR: {r['error'][:60]}" if r["error"] else ""
        click.echo(
            f"#{r['id']:<5} {r['job_id']:<28} {r['status']:<8}"
            f" {started}  {finished}{err}"
        )


@cron_cmd.command("add")
@click.argument("job_id")
@click.argument("name")
@click.option(
    "--schedule", "-s", required=True,
    help="Cron expression, e.g. '30 9 * * 1-5'",
)
@click.option("--model", "-m", default="ollama:qwen3:14b", show_default=True)
@click.option(
    "--prompt-file", "-p", required=True,
    help="Path to prompt markdown file",
)
@click.option(
    "--output", "-o", required=True,
    help="Output path or 'inbox'",
)
@click.option("--timeout", default=120, show_default=True, type=int)
@click.option(
    "--enabled/--disabled", default=True, show_default=True,
)
def cron_add(job_id, name, schedule, model, prompt_file, output,
             timeout, enabled):
    """Add a new cron job definition."""
    job = {
        "id": job_id,
        "name": name,
        "schedule": schedule,
        "model": model,
        "prompt_file": prompt_file,
        "output": output,
        "timeout": timeout,
        "enabled": enabled,
    }
    try:
        add_job(_jobs_file(), job)
    except ValueError as e:
        click.echo(str(e), err=True)
        sys.exit(1)
    click.echo(f"Added job: {job_id}")


@cron_cmd.command("delete")
@click.argument("job_id")
def cron_delete(job_id):
    """Remove a cron job definition."""
    ok = delete_job(_jobs_file(), job_id)
    if not ok:
        click.echo(f"Job not found: {job_id}", err=True)
        sys.exit(1)
    click.echo(f"Deleted: {job_id}")
