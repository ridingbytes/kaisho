"""CLI command for converting between backends."""
import os
import sys

import click

from ..services.convert import (
    convert_backend,
    make_backend_from_spec,
)

FORMATS = ["org", "markdown", "json", "sql"]


@click.command("convert")
@click.option(
    "--from", "from_fmt",
    type=click.Choice(FORMATS),
    required=True,
    help="Source backend format",
)
@click.option(
    "--to", "to_fmt",
    type=click.Choice(FORMATS),
    required=True,
    help="Target backend format",
)
@click.option(
    "--source",
    required=True,
    help="Source directory or DSN",
)
@click.option(
    "--target",
    required=True,
    help="Target directory or DSN",
)
def convert_cmd(from_fmt, to_fmt, source, target):
    """Convert data between backends.

    Examples:

        kai convert --from org --to markdown \\
            --source ./data/org --target ./data/md

        kai convert --from markdown --to sql \\
            --source ./data/md \\
            --target sqlite:///./data/kaisho.db
    """
    if from_fmt == to_fmt:
        click.echo(
            "Source and target formats are the same.",
            err=True,
        )
        sys.exit(1)

    click.echo(
        f"Converting {from_fmt} -> {to_fmt}..."
    )
    click.echo(f"  Source: {source}")
    click.echo(f"  Target: {target}")

    try:
        src = make_backend_from_spec(from_fmt, source)
        tgt = make_backend_from_spec(to_fmt, target)
        summary = convert_backend(src, tgt)
    except Exception as e:  # noqa: BLE001
        # Preserve the exception class so a misconfigured
        # DSN does not collapse into a one-line message
        # with no hint of where it came from. Full
        # traceback available under KAISHO_LOG=DEBUG so
        # the friendly path stays single-line.
        click.echo(
            f"Error ({type(e).__name__}): {e}", err=True,
        )
        log_level = os.environ.get("KAISHO_LOG", "").upper()
        if log_level == "DEBUG":
            import traceback
            traceback.print_exc()
        sys.exit(1)

    click.echo("Done:")
    for entity, count in summary.items():
        click.echo(f"  {entity}: {count}")
