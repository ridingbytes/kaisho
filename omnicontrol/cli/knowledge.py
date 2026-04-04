import json
import sys

import click

from ..config import get_config
from ..services import knowledge as kb_service


def _cfg():
    return get_config()


@click.group("kb")
def knowledge():
    """Search and browse the knowledge base."""


@knowledge.command("list")
@click.option("--json", "as_json", is_flag=True)
def kb_list(as_json):
    """List all markdown files in the knowledge base."""
    cfg = _cfg()
    entries = kb_service.file_tree(cfg.WISSEN_DIR, cfg.RESEARCH_DIR)
    if as_json:
        click.echo(json.dumps(entries, default=str))
        return
    if not entries:
        click.echo("No knowledge base files found.")
        return
    for e in entries:
        size_kb = e["size"] / 1024
        click.echo(
            f"[{e['label']}]  {e['path']:<50}  {size_kb:>5.1f} KB"
        )


@knowledge.command("show")
@click.argument("path")
def kb_show(path):
    """Show the contents of a knowledge base file."""
    cfg = _cfg()
    content = kb_service.read_file(
        cfg.WISSEN_DIR, cfg.RESEARCH_DIR, path
    )
    if content is None:
        click.echo(f"File not found: {path}", err=True)
        sys.exit(1)
    click.echo(content, nl=False)


@knowledge.command("search")
@click.argument("query", nargs=-1, required=True)
@click.option("--max", "max_results", default=20, show_default=True)
@click.option("--json", "as_json", is_flag=True)
def kb_search(query, max_results, as_json):
    """Search knowledge base files for a query."""
    q = " ".join(query)
    cfg = _cfg()
    results = kb_service.search(
        cfg.WISSEN_DIR, cfg.RESEARCH_DIR, q, max_results=max_results
    )
    if as_json:
        click.echo(json.dumps(results, default=str))
        return
    if not results:
        click.echo(f"No results for: {q}")
        return
    for r in results:
        click.echo(
            f"[{r['label']}]  {r['path']}:{r['line_number']}"
        )
        click.echo(f"  {r['snippet']}")
