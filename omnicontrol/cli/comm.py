import json
import sys

import click

from ..config import get_config
from ..services import communications as comm_service


def _db():
    return get_config().DB_FILE


@click.group("comm")
def comm():
    """Log and search communication history."""


@comm.command("add")
@click.argument("subject", nargs=-1, required=True)
@click.option(
    "--direction", "-d",
    type=click.Choice(["in", "out"]),
    required=True,
    help="Inbound or outbound",
)
@click.option(
    "--channel", "-c",
    type=click.Choice(["email", "phone", "chat", "other"]),
    default="email",
    show_default=True,
)
@click.option("--customer", "-k", default=None)
@click.option("--body", "-b", default="")
@click.option("--contact", default="")
@click.option("--json", "as_json", is_flag=True)
def comm_add(subject, direction, channel, customer, body, contact,
             as_json):
    """Log a communication entry."""
    subj = " ".join(subject)
    record = comm_service.log_comm(
        _db(), subj, direction, channel,
        customer=customer, body=body, contact=contact,
    )
    if as_json:
        click.echo(json.dumps(record, default=str))
        return
    click.echo(
        f"Logged #{record['id']}: [{direction}] {channel} — {subj}"
    )


@comm.command("list")
@click.option("--customer", "-k", default=None)
@click.option("--channel", "-c", default=None)
@click.option("--direction", "-d", default=None)
@click.option("--limit", default=50, show_default=True)
@click.option("--json", "as_json", is_flag=True)
def comm_list(customer, channel, direction, limit, as_json):
    """List communication entries."""
    records = comm_service.list_comms(
        _db(), customer=customer, channel=channel,
        direction=direction, limit=limit,
    )
    if as_json:
        click.echo(json.dumps(records, default=str))
        return
    if not records:
        click.echo("No entries found.")
        return
    for r in records:
        ts = r["ts"][:10]
        cust = f"[{r['customer']}] " if r["customer"] else ""
        click.echo(
            f"#{r['id']:<4} {ts}  {r['direction']:<3} "
            f"{r['channel']:<6}  {cust}{r['subject']}"
        )


@comm.command("show")
@click.argument("comm_id", type=int)
@click.option("--json", "as_json", is_flag=True)
def comm_show(comm_id, as_json):
    """Show full details of a communication entry."""
    record = comm_service.get_comm(_db(), comm_id)
    if record is None:
        click.echo(f"Entry not found: #{comm_id}", err=True)
        sys.exit(1)
    if as_json:
        click.echo(json.dumps(record, default=str))
        return
    click.echo(f"ID:        #{record['id']}")
    click.echo(f"Date:      {record['ts'][:10]}")
    click.echo(f"Direction: {record['direction']}")
    click.echo(f"Channel:   {record['channel']}")
    if record["customer"]:
        click.echo(f"Customer:  {record['customer']}")
    if record["contact"]:
        click.echo(f"Contact:   {record['contact']}")
    click.echo(f"Subject:   {record['subject']}")
    if record["body"]:
        click.echo("")
        click.echo(record["body"])


@comm.command("search")
@click.argument("query", nargs=-1, required=True)
@click.option("--limit", default=50, show_default=True)
@click.option("--json", "as_json", is_flag=True)
def comm_search(query, limit, as_json):
    """Search communications by subject or body text."""
    q = " ".join(query)
    records = comm_service.search_comms(_db(), q, limit=limit)
    if as_json:
        click.echo(json.dumps(records, default=str))
        return
    if not records:
        click.echo(f"No results for: {q}")
        return
    for r in records:
        ts = r["ts"][:10]
        cust = f"[{r['customer']}] " if r["customer"] else ""
        click.echo(
            f"#{r['id']:<4} {ts}  {r['channel']:<6}  "
            f"{cust}{r['subject']}"
        )


@comm.command("delete")
@click.argument("comm_id", type=int)
def comm_delete(comm_id):
    """Delete a communication entry."""
    ok = comm_service.delete_comm(_db(), comm_id)
    if not ok:
        click.echo(f"Entry not found: #{comm_id}", err=True)
        sys.exit(1)
    click.echo(f"Deleted #{comm_id}.")
