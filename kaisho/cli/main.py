import os

import click

from .advisor import ask_cmd
from .youtube import youtube_cmd
from .briefing import briefing
from .clock import clock
from .config_cmd import config_cmd
from .contract import contract_cmd
from .cron import cron_cmd
from .customer import customer
from .gh import gh
from .inbox import inbox
from .knowledge import knowledge
from .tag import tag
from .task import task
from ..config import (
    delete_profile,
    get_config,
    init_data_dir,
    list_profiles,
    list_users,
    rename_profile,
    reset_config,
)


@click.group()
@click.option(
    "--user", "-u",
    envvar="KAISHO_USER",
    default=None,
    help="User name (default: $KAISHO_USER or 'default')",
)
@click.option(
    "--profile", "-p",
    envvar="KAISHO_PROFILE",
    default=None,
    help="Profile name (default: $KAISHO_PROFILE or 'default')",
)
def cli(user, profile):
    """Kaisho - Personal productivity system."""
    if user:
        os.environ["KAISHO_USER"] = user
    if profile:
        os.environ["PROFILE"] = profile
    if user or profile:
        reset_config()
    init_data_dir()


@cli.command("serve")
@click.option("--host", default=None)
@click.option("--port", default=None, type=int)
@click.option("--reload", is_flag=True, default=False)
def serve(host, port, reload):
    """Start the Kaisho API server."""
    import uvicorn
    cfg = get_config()
    uvicorn.run(
        "kaisho.api.app:app",
        host=host or cfg.HOST,
        port=port or cfg.PORT,
        reload=reload,
    )


@cli.command("users")
def users_cmd():
    """List user accounts."""
    for u in list_users():
        marker = " *" if u["username"] == get_config().USER else ""
        bio = f" ({u['bio']})" if u.get("bio") else ""
        click.echo(f"  {u['username']}{marker}{bio}")


@cli.group("profiles", invoke_without_command=True)
@click.pass_context
def profiles_cmd(ctx):
    """Manage profiles for the current user."""
    if ctx.invoked_subcommand is None:
        cfg = get_config()
        active = cfg.PROFILE
        click.echo(f"User: {cfg.KAISHO_USER}")
        for name in list_profiles(cfg):
            marker = " *" if name == active else ""
            click.echo(f"  {name}{marker}")


@profiles_cmd.command("list")
def profiles_list():
    """List all profiles for the current user."""
    cfg = get_config()
    active = cfg.PROFILE
    click.echo(f"User: {cfg.KAISHO_USER}")
    for name in list_profiles(cfg):
        marker = " *" if name == active else ""
        click.echo(f"  {name}{marker}")


@profiles_cmd.command("delete")
@click.argument("name")
@click.option(
    "--yes", "-y", is_flag=True,
    help="Skip confirmation prompt.",
)
def profiles_delete(name, yes):
    """Delete a profile and all its data.

    NAME is the profile to delete. The active profile cannot be
    deleted. This action is irreversible.
    """
    if not yes:
        click.confirm(
            f"Delete profile '{name}' and all its data?",
            abort=True,
        )
    try:
        delete_profile(name)
        click.echo(f"Deleted profile '{name}'.")
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc


@profiles_cmd.command("rename")
@click.argument("old_name")
@click.argument("new_name")
def profiles_rename(old_name, new_name):
    """Rename a profile.

    OLD_NAME is the current profile name; NEW_NAME is the target.
    The active profile cannot be renamed.
    """
    try:
        rename_profile(old_name, new_name)
        click.echo(f"Renamed profile '{old_name}' → '{new_name}'.")
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc


cli.add_command(task)
cli.add_command(clock)
cli.add_command(customer)
cli.add_command(contract_cmd, name="contract")
cli.add_command(inbox)
cli.add_command(knowledge)
cli.add_command(gh)
cli.add_command(cron_cmd, name="cron")
cli.add_command(briefing)
cli.add_command(tag)
cli.add_command(config_cmd)
cli.add_command(ask_cmd)
cli.add_command(youtube_cmd, name="youtube")
