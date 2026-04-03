import click

from .briefing import briefing
from .clock import clock
from .customer import customer
from .inbox import inbox
from .task import task


@click.group()
def cli():
    """OmniControl - Personal productivity system."""


cli.add_command(task)
cli.add_command(clock)
cli.add_command(customer)
cli.add_command(inbox)
cli.add_command(briefing)
