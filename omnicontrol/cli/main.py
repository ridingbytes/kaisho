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
    get_config,
    init_data_dir,
    list_profiles,
    list_users,
    reset_config,
)


@click.group()
@click.option(
    "--user", "-u",
    envvar="OC_USER",
    default=None,
    help="User name (default: $OC_USER or 'default')",
)
@click.option(
    "--profile", "-p",
    envvar="OC_PROFILE",
    default=None,
    help="Profile name (default: $OC_PROFILE or 'default')",
)
def cli(user, profile):
    """OmniControl - Personal productivity system."""
    if user:
        os.environ["OC_USER"] = user
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
    """Start the OmniControl API server."""
    import uvicorn
    cfg = get_config()
    uvicorn.run(
        "omnicontrol.api.app:app",
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


@cli.command("profiles")
def profiles_cmd():
    """List profiles for the current user."""
    cfg = get_config()
    active = cfg.PROFILE
    click.echo(f"User: {cfg.USER}")
    for name in list_profiles(cfg):
        marker = " *" if name == active else ""
        click.echo(f"  {name}{marker}")


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
