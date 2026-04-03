import click

from ..config import get_config, load_settings_yaml
from ..services import kanban as kanban_svc
from ..services import settings as settings_svc
from ..services.settings import get_state_names
from ..org.parser import KEYWORDS as DEFAULT_KEYWORDS


def _get_keywords() -> set[str]:
    """Get task keywords from settings."""
    s = load_settings_yaml()
    names = get_state_names(s)
    return set(names) if names else DEFAULT_KEYWORDS


@click.group()
def tag():
    """Manage tags in settings.yaml."""


@tag.command("list")
def tag_list():
    """List all tags with usage counts."""
    cfg = get_config()
    keywords = _get_keywords()
    tasks = kanban_svc.list_tasks(
        todos_file=cfg.TODOS_FILE,
        keywords=keywords,
        include_done=True,
    )
    settings = load_settings_yaml()
    configured = {
        t["name"]: t for t in settings.get("tags", [])
    }
    counts: dict[str, int] = {}
    for task in tasks:
        for t in task.get("tags") or []:
            counts[t] = counts.get(t, 0) + 1

    if not counts and not configured:
        click.echo("No tags found.")
        return

    all_names = sorted(set(counts) | set(configured))
    for name in all_names:
        count = counts.get(name, 0)
        meta = configured.get(name, {})
        color = meta.get("color", "")
        desc = meta.get("description", "")
        parts = [f"{name} ({count})"]
        if color:
            parts.append(f"color={color}")
        if desc:
            parts.append(desc)
        click.echo("  ".join(parts))


@tag.command("add")
@click.argument("name")
@click.option("--color", required=True, help="Tag color (e.g. #ff0000)")
@click.option("--description", default="", help="Tag description")
def tag_add(name, color, description):
    """Add a tag to settings.yaml."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    tags = data.get("tags", [])
    if any(t["name"] == name for t in tags):
        click.echo(f"Tag '{name}' already exists.", err=True)
        raise SystemExit(1)
    new_tag = {
        "name": name,
        "color": color,
        "description": description,
    }
    tags.append(new_tag)
    data["tags"] = tags
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)
    click.echo(f"Tag '{name}' added.")


@tag.command("update")
@click.argument("name")
@click.option("--color", default=None, help="New color")
@click.option("--description", default=None, help="New description")
def tag_update(name, color, description):
    """Update a tag in settings.yaml."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    tags = data.get("tags", [])
    tag_entry = next((t for t in tags if t["name"] == name), None)
    if tag_entry is None:
        click.echo(f"Tag '{name}' not found.", err=True)
        raise SystemExit(1)
    if color is not None:
        tag_entry["color"] = color
    if description is not None:
        tag_entry["description"] = description
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)
    click.echo(f"Tag '{name}' updated.")


@tag.command("remove")
@click.argument("name")
def tag_remove(name):
    """Remove a tag from settings.yaml."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    data["tags"] = [
        t for t in data.get("tags", []) if t["name"] != name
    ]
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)
    click.echo(f"Tag '{name}' removed.")
