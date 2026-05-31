"""``kai caldav`` -- manage CalDAV calendar accounts.

Same surface as the FastAPI router, plus a couple of
ergonomic flags so the user can smoke-test a new account
without spinning up the desktop UI:

    kai caldav presets
    kai caldav test --preset icloud --user user@icloud.com
    kai caldav add --preset fastmail --user me@fastmail.com
    kai caldav list
    kai caldav calendars <account_id>
    kai caldav events --from 2026-05-30 --to 2026-06-06
    kai caldav remove <account_id>
"""
from datetime import datetime, timedelta

import click

from ..services import caldav as caldav_svc
from ..services.caldav_presets import list_presets


@click.group("caldav")
def caldav_cmd():
    """Manage CalDAV calendar accounts (Apple iCloud,
    Fastmail, Nextcloud, custom)."""


@caldav_cmd.command("presets")
def presets():
    """List supported provider presets."""
    for p in list_presets():
        click.echo(f"  {p['id']:10} {p['label']}")


@caldav_cmd.command("test")
@click.option("--preset", required=True)
@click.option("--user", "username", required=True)
@click.option("--host", default="")
@click.option("--url", default="")
@click.password_option(
    "--password", confirmation_prompt=False,
    help="App-specific / device password.",
)
def test(preset, username, host, url, password):
    """Verify a connection without saving anything."""
    from ..services.caldav_presets import resolve_url
    resolved = resolve_url(
        preset, host=host, username=username, url=url,
    )
    click.echo(f"Resolved URL: {resolved}")
    try:
        info = caldav_svc.test_connection(
            resolved, username, password,
        )
    except caldav_svc.CalDavError as exc:
        raise click.ClickException(str(exc))
    click.echo(f"OK -- {info['calendar_count']} calendar(s)")


@caldav_cmd.command("add")
@click.option("--preset", required=True)
@click.option("--user", "username", required=True)
@click.option("--label", default="")
@click.option("--host", default="")
@click.option("--url", default="")
@click.password_option(
    "--password", confirmation_prompt=False,
    help="App-specific / device password.",
)
def add(preset, username, label, host, url, password):
    """Add an account after a connection check."""
    try:
        record = caldav_svc.add_account(
            preset=preset, username=username,
            password=password, label=label,
            host=host, url=url,
        )
    except caldav_svc.CalDavError as exc:
        raise click.ClickException(str(exc))
    click.echo(
        f"Added {record['id']} "
        f"({record['label']}, storage={record['storage']})"
    )


@caldav_cmd.command("list")
def list_accounts():
    """List configured accounts."""
    accounts = caldav_svc.list_accounts()
    if not accounts:
        click.echo("No CalDAV accounts configured.")
        return
    for a in accounts:
        click.echo(
            f"  {a['id']}  {a['label']:24} "
            f"{a['preset']:10} {a['username']}"
        )


@caldav_cmd.command("calendars")
@click.argument("account_id")
def calendars(account_id):
    """List calendars on one account."""
    try:
        cals = caldav_svc.list_calendars(account_id)
    except caldav_svc.CalDavError as exc:
        raise click.ClickException(str(exc))
    for c in cals:
        colour = c.get("color") or "-"
        click.echo(f"  {colour:8} {c['name']}")
        click.echo(f"           {c['id']}")


@caldav_cmd.command("events")
@click.option(
    "--from", "frm", default=None,
    help="ISO date (default: today)",
)
@click.option(
    "--to", default=None,
    help="ISO date (default: 7 days from --from)",
)
@click.option("--account", "account_id", default=None)
@click.option("--limit", type=int, default=None)
def events(frm, to, account_id, limit):
    """List events in a window."""
    frm_dt = (
        datetime.fromisoformat(frm)
        if frm else datetime.now()
    )
    to_dt = (
        datetime.fromisoformat(to)
        if to else frm_dt + timedelta(days=7)
    )
    try:
        results = caldav_svc.list_events(
            frm=frm_dt, to=to_dt,
            account_id=account_id, limit=limit,
        )
    except caldav_svc.CalDavError as exc:
        raise click.ClickException(str(exc))
    if not results:
        click.echo("No events.")
        return
    for ev in results:
        marker = "[all-day]" if ev["all_day"] else ""
        click.echo(
            f"  {ev['start'][:16]:18} {marker:9} "
            f"{ev['title']}"
        )


@caldav_cmd.command("remove")
@click.argument("account_id")
def remove(account_id):
    """Remove an account (deletes its stored password)."""
    if caldav_svc.remove_account(account_id):
        click.echo(f"Removed {account_id}")
    else:
        raise click.ClickException(
            f"unknown account: {account_id}"
        )


# -- Write surface (Phase 1.5 smoke commands) ------------------------


@caldav_cmd.command("ensure-calendar")
@click.argument("account_id")
def ensure_calendar(account_id):
    """Make sure the per-account 'Kaisho' calendar exists,
    creating it if missing. Returns its URL."""
    try:
        cal = caldav_svc.ensure_kaisho_calendar(account_id)
    except caldav_svc.CalDavError as exc:
        raise click.ClickException(str(exc))
    click.echo(f"  name: {cal['name']}")
    click.echo(f"  url:  {cal['id']}")


@caldav_cmd.command("push-test")
@click.option("--account", "account_id", required=True)
@click.option("--calendar", "calendar_id", default=None)
@click.option("--summary", default="Kaisho test event")
@click.option(
    "--minutes", type=int, default=60,
    help="Event duration; starts now.",
)
def push_test(account_id, calendar_id, summary, minutes):
    """Push a one-shot test event to verify writes work."""
    from datetime import datetime, timedelta, timezone
    if calendar_id is None:
        try:
            cal = caldav_svc.ensure_kaisho_calendar(
                account_id,
            )
        except caldav_svc.CalDavError as exc:
            raise click.ClickException(str(exc))
        calendar_id = cal["id"]
        click.echo(f"Using {cal['name']}")

    start = datetime.now(timezone.utc)
    end = start + timedelta(minutes=minutes)
    try:
        created = caldav_svc.create_event(
            account_id=account_id,
            calendar_id=calendar_id,
            summary=summary,
            start=start,
            end=end,
        )
    except caldav_svc.CalDavError as exc:
        raise click.ClickException(str(exc))
    click.echo(f"Created {created['event_url']}")
    click.echo(f"  uid:  {created['uid']}")
    click.echo(f"  etag: {created['etag']}")


@caldav_cmd.command("delete-event")
@click.option("--account", "account_id", required=True)
@click.argument("event_url")
def delete_event_cmd(account_id, event_url):
    """Delete a VEVENT by its server URL (idempotent)."""
    try:
        caldav_svc.delete_event(account_id, event_url)
    except caldav_svc.CalDavError as exc:
        raise click.ClickException(str(exc))
    click.echo("Deleted (or already gone).")


@caldav_cmd.command("push-sync")
def push_sync():
    """Run one CalDAV push cycle synchronously.

    Useful for manual smoke without waiting for the next
    clock-entry mutation to trigger the background push.
    Prints the per-cycle summary.
    """
    from ..services import caldav_sync
    summary = caldav_sync.sync_now()
    for k, v in summary.items():
        click.echo(f"  {k:8} {v}")


@caldav_cmd.command("push-entry")
@click.argument("sync_id")
def push_entry(sync_id):
    """Force-push one clock entry to every push-enabled
    account, bypassing the enabled_since cutoff.

    Useful when you want a historical entry in your
    calendar without back-flooding the whole window. The
    entry is looked up by sync_id from the active backend.
    """
    from ..services import caldav_sync
    summary = caldav_sync.sync_entry(sync_id)
    for k, v in summary.items():
        click.echo(f"  {k:8} {v}")


@caldav_cmd.command("backfill")
@click.option(
    "--from", "frm", required=True,
    help="Window start (YYYY-MM-DD, inclusive).",
)
@click.option(
    "--to", "to", default=None,
    help="Window end (YYYY-MM-DD, inclusive). "
         "Defaults to today.",
)
def backfill(frm, to):
    """Reconcile every entry in the given date range
    against every push-enabled account, bypassing the
    enabled_since cutoff.

    Use deliberately -- a wide window creates one VEVENT
    per entry per account.
    """
    from datetime import date
    from ..services import caldav_sync
    frm_d = date.fromisoformat(frm)
    to_d = date.fromisoformat(to) if to else date.today()
    summary = caldav_sync.backfill_range(frm_d, to_d)
    for k, v in summary.items():
        click.echo(f"  {k:8} {v}")


@caldav_cmd.command("push-state")
def push_state():
    """Dump the current per-account sync health for
    troubleshooting (last error, failure count, last
    success timestamp)."""
    import json
    from ..services import caldav_sync
    state = caldav_sync._load_state()
    accounts = caldav_svc.list_accounts()
    if not accounts:
        click.echo("No accounts configured.")
        return
    for acc in accounts:
        health = state["per_account"].get(acc["id"], {})
        click.echo(f"\n{acc['id']} ({acc['label']})")
        if not health:
            click.echo("  no sync activity yet")
            continue
        click.echo(json.dumps(health, indent=2))
