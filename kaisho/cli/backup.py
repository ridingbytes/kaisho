"""``kai backup`` CLI commands.

Wraps the backup service so users can run backups
manually from the terminal.
"""
import click

from ..config import get_config
from ..services import backup as backup_svc
from ..services import settings as settings_svc


def _load_backup_cfg():
    """Return (cfg, settings, backup_cfg, backup_dir)."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    backup_cfg = settings_svc.get_backup_settings(data)
    target = settings_svc.resolve_backup_dir(data, cfg)
    return cfg, data, backup_cfg, target


def _human_size(n: int) -> str:
    """Format a byte count as a human-readable string."""
    size = float(n)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024 or unit == "TB":
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} PB"


@click.group(
    "backup", invoke_without_command=True,
)
@click.pass_context
def backup_cmd(ctx):
    """Create, list and prune Kaisho backup archives."""
    if ctx.invoked_subcommand is None:
        ctx.invoke(backup_list)


@backup_cmd.command("create")
@click.option(
    "--no-prune", is_flag=True, default=False,
    help="Skip pruning old backups after creating this one.",
)
def backup_create(no_prune):
    """Create a backup archive now."""
    cfg, _, backup_cfg, target = _load_backup_cfg()
    try:
        info = backup_svc.create_backup(
            source_dir=cfg.DATA_DIR,
            backup_dir=target,
            profile=cfg.PROFILE,
        )
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc
    click.echo(
        f"Created {info.filename} "
        f"({_human_size(info.size_bytes)})",
    )
    keep = backup_cfg.get("keep", 0)
    if not no_prune and keep > 0:
        removed = backup_svc.prune_backups(target, keep)
        for r in removed:
            click.echo(f"Pruned {r.filename}")


@backup_cmd.command("list")
def backup_list():
    """List existing backups, newest first."""
    _, _, _, target = _load_backup_cfg()
    backups = backup_svc.list_backups(target)
    if not backups:
        click.echo(f"No backups in {target}.")
        return
    click.echo(f"Backups in {target}:")
    for info in backups:
        created = info.created_at.strftime(
            "%Y-%m-%d %H:%M:%S",
        )
        click.echo(
            f"  {info.filename}  "
            f"{_human_size(info.size_bytes):>10}  "
            f"{created}",
        )


@backup_cmd.command("prune")
@click.option(
    "--keep", type=int, default=None,
    help="Override the configured keep count.",
)
def backup_prune(keep):
    """Delete all but the newest N backups."""
    _, _, backup_cfg, target = _load_backup_cfg()
    actual_keep = (
        keep if keep is not None
        else backup_cfg.get("keep", 0)
    )
    if actual_keep < 0:
        raise click.ClickException("keep must be >= 0")
    try:
        removed = backup_svc.prune_backups(
            target, actual_keep,
        )
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc
    if not removed:
        click.echo("Nothing to prune.")
        return
    for r in removed:
        click.echo(f"Pruned {r.filename}")
