"""Regression test: a cloud-origin pull clears the
desktop-local PAUSED flag in the org backend.

PAUSED is a desktop-only UI affordance and never crosses
the wire. ``services.clocks.apply_sync_payload`` used to
overwrite start/end/customer/etc. but never touched
``PAUSED``, so a paused entry stayed marked PAUSED forever
once another device resumed or stopped it — the desktop's
running-timer card kept offering "Resume" for an entry the
cloud thought was finished.
"""
from pathlib import Path

from kaisho.org.parser import parse_org_file
from kaisho.services import clocks as clocks_svc
from kaisho.services.clocks import CLOCK_KEYWORDS


CLOCKS_HEADER = ""


def _seed_paused_entry(
    clocks_file: Path, sync_id: str,
) -> None:
    """Write a single stopped, paused entry whose
    UPDATED_AT is in the past so any later
    ``apply_sync_payload`` with a 2099-dated payload wins
    last-writer-wins."""
    clocks_file.write_text(
        f"* [2026-06-09 Tue] [KAISHO]: paused-entry\n"
        f"  :PROPERTIES:\n"
        f"  :SYNC_ID: {sync_id}\n"
        f"  :UPDATED_AT: 2026-06-09T10:30:40\n"
        f"  :PAUSED: true\n"
        f"  :END:\n"
        f"  :LOGBOOK:\n"
        f"  CLOCK: [2026-06-09 Tue 10:29]--[2026-06-09 Tue 10:30]"
        f" =>  0:01\n"
        f"  :END:\n",
        encoding="utf-8",
    )


def test_pull_clears_paused_property(tmp_path):
    clocks_file = tmp_path / "clocks.org"
    sync_id = "c6924c10-b65b-48c7-af99-44580d85f4b4"
    _seed_paused_entry(clocks_file, sync_id)

    # Sanity check: the seed has PAUSED:true.
    org = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    assert org.headings[0].properties.get("PAUSED") == "true"

    # Cloud sends a newer update (resume / stop on another
    # device). Far-future updated_at to bypass LWW.
    clocks_svc.update_clock_entry_by_sync_id(
        clocks_file=clocks_file,
        sync_id=sync_id,
        fields={
            "sync_id": sync_id,
            "customer": "KAISHO",
            "description": "paused-entry",
            "start": "2026-06-09T10:29:00",
            "end": "2099-01-01T11:00:00",
            "updated_at": "2099-01-01T11:00:01",
            "invoiced": False,
            "task_id": None,
            "contract": None,
            "notes": "",
        },
    )

    org = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    assert "PAUSED" not in org.headings[0].properties, (
        "cloud pull must clear the desktop-local PAUSED "
        "flag — leaving it stuck strands the running-timer "
        "card on a stale Resume affordance"
    )


def test_pull_clears_paused_for_resumed_running_entry(
    tmp_path,
):
    """When the cloud resumes a paused entry, the pulled
    payload has end=null (running). PAUSED must clear in
    that case too, otherwise the desktop renders an
    impossible 'paused-and-running' state."""
    clocks_file = tmp_path / "clocks.org"
    sync_id = "abc-resumed"
    _seed_paused_entry(clocks_file, sync_id)

    clocks_svc.update_clock_entry_by_sync_id(
        clocks_file=clocks_file,
        sync_id=sync_id,
        fields={
            "sync_id": sync_id,
            "customer": "KAISHO",
            "description": "paused-entry",
            "start": "2026-06-09T10:29:00",
            "end": None,
            "updated_at": "2099-01-01T11:00:01",
            "invoiced": False,
            "task_id": None,
            "contract": None,
            "notes": "",
        },
    )

    org = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    assert "PAUSED" not in org.headings[0].properties
    # And the clock is now running (no end).
    clock = org.headings[0].logbook[0]
    assert clock.end is None
