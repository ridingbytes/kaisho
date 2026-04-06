import sys

import click

from ..backends import get_backend
from ..config import get_config
from ..services.advisor import ask
from ..services.github import GhError, issues_for_customers


DEFAULT_MODEL = "ollama:qwen3:14b"


def _gather_github_issues(customers: list[dict]) -> list[dict]:
    """Fetch GitHub issues, silently skip on auth errors."""
    try:
        return issues_for_customers(customers)
    except GhError:
        return []
    except FileNotFoundError:
        return []


@click.command("ask")
@click.argument("question", nargs=-1, required=True)
@click.option(
    "--model", "-m",
    default=DEFAULT_MODEL,
    show_default=True,
    help="Model to use, e.g. 'ollama:qwen3:14b' or 'claude:claude-opus-4-6'",
)
@click.option(
    "--no-github", is_flag=True, default=False,
    help="Skip fetching GitHub issues (faster)",
)
@click.option(
    "--no-context", is_flag=True, default=False,
    help="Send question without Kaisho context",
)
def ask_cmd(question, model, no_github, no_context):
    """Ask the AI advisor a question with full Kaisho context."""
    q = " ".join(question)
    cfg = get_config()
    backend = get_backend()

    if no_context:
        tasks, clocks, inbox, customers, gh_issues = [], [], [], [], []
    else:
        click.echo("Gathering context...", err=True)
        tasks = backend.tasks.list_tasks(include_done=False)
        clocks = backend.clocks.list_entries(period="month")
        inbox = backend.inbox.list_items()
        customers = backend.customers.list_customers()
        gh_issues = (
            [] if no_github
            else _gather_github_issues(customers)
        )

    click.echo(f"Asking {model}...", err=True)
    try:
        answer = ask(
            question=q,
            model_str=model,
            tasks=tasks,
            clock_entries=clocks,
            inbox_items=inbox,
            customers=customers,
            github_issues=gh_issues,
            ollama_base_url=cfg.OLLAMA_BASE_URL,
        )
    except RuntimeError as exc:
        click.echo(f"Error: {exc}", err=True)
        sys.exit(1)

    click.echo("")
    click.echo(answer)
