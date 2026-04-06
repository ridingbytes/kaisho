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
from ..config import get_config, init_data_dir


@click.group()
def cli():
    init_data_dir()
    """OmniControl - Personal productivity system."""


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
