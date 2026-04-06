import click

from ..config import get_config
from ..services import settings as settings_svc


@click.group("config")
def config_cmd():
    """Manage Kaisho configuration (task states, etc.)."""


@config_cmd.command("states")
def list_states():
    """List all task states."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    states = data.get("task_states", [])
    if not states:
        click.echo("No task states configured.")
        return
    for state in states:
        name = state.get("name", "")
        label = state.get("label", "")
        color = state.get("color", "")
        done = " [done]" if state.get("done") else ""
        click.echo(f"  {name}  {label}  {color}{done}")


@config_cmd.command("add-state")
@click.argument("name")
@click.option("--label", required=True, help="Display label")
@click.option(
    "--color", required=True, help="State color (e.g. #ff0000)"
)
@click.option(
    "--after", default=None,
    help="Insert after this state name"
)
@click.option(
    "--done", is_flag=True, default=False,
    help="Mark as a done state"
)
def add_state(name, label, color, after, done):
    """Add a task state to settings.yaml."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    states = data.get("task_states", [])
    if any(s["name"] == name for s in states):
        click.echo(f"State '{name}' already exists.", err=True)
        raise SystemExit(1)
    new_state = {
        "name": name,
        "label": label,
        "color": color,
        "done": done,
    }
    if after:
        idx = next(
            (i for i, s in enumerate(states) if s["name"] == after),
            None,
        )
        if idx is not None:
            states.insert(idx + 1, new_state)
        else:
            states.append(new_state)
    else:
        states.append(new_state)
    data["task_states"] = states
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)
    click.echo(f"State '{name}' added.")


@config_cmd.command("remove-state")
@click.argument("name")
def remove_state(name):
    """Remove a task state from settings.yaml."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    states = data.get("task_states", [])
    data["task_states"] = [s for s in states if s["name"] != name]
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)
    click.echo(f"State '{name}' removed.")


@config_cmd.command("move-state")
@click.argument("name")
@click.option(
    "--after", required=True,
    help="Move state to after this state name"
)
def move_state(name, after):
    """Move a task state to a new position."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    states = data.get("task_states", [])

    target = next((s for s in states if s["name"] == name), None)
    if target is None:
        click.echo(f"State '{name}' not found.", err=True)
        raise SystemExit(1)

    states = [s for s in states if s["name"] != name]
    after_idx = next(
        (i for i, s in enumerate(states) if s["name"] == after),
        None,
    )
    if after_idx is not None:
        states.insert(after_idx + 1, target)
    else:
        states.append(target)

    data["task_states"] = states
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)
    click.echo(f"State '{name}' moved after '{after}'.")
