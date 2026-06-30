"""iCalendar serialisation for clock entries.

Pure formatting logic extracted from the clocks router so
the router stays a thin request/response shim.
"""
import hashlib


def _escape(text: str) -> str:
    """Escape special characters for iCalendar text."""
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _fmt(iso: str) -> str:
    """Convert an ISO timestamp to iCal basic format.

    ``2026-04-14T09:00:00+02:00`` -> ``20260414T090000``.
    """
    return iso[:19].replace("-", "").replace(":", "")


def entry_to_vevent(entry: dict) -> str:
    """Convert a clock entry to an iCalendar VEVENT block."""
    start = entry.get("start", "")
    end = entry.get("end", "")
    customer = entry.get("customer", "")
    desc = entry.get("description", "")
    contract = entry.get("contract") or ""
    notes = entry.get("notes") or ""
    minutes = entry.get("duration_minutes") or 0

    # UID: prefer sync_id for uniqueness, fall back to a
    # content hash for entries without one.
    sync_id = entry.get("sync_id", "")
    if sync_id:
        uid = f"{sync_id}@kaisho"
    else:
        raw = f"{start}-{customer}-{desc}"
        digest = hashlib.sha1(
            raw.encode(), usedforsecurity=False,
        ).hexdigest()[:16]
        uid = f"{digest}@kaisho"

    summary = f"[{customer}] {desc}" if customer else desc
    if contract:
        summary += f" ({contract})"

    lines = [
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTART:{_fmt(start)}",
    ]
    if end:
        lines.append(f"DTEND:{_fmt(end)}")
    elif minutes > 0:
        hours = int(minutes // 60)
        mins = int(minutes % 60)
        lines.append(f"DURATION:PT{hours}H{mins}M")

    lines.append(f"SUMMARY:{_escape(summary)}")
    if notes:
        lines.append(f"DESCRIPTION:{_escape(notes)}")
    lines.append("END:VEVENT")
    return "\r\n".join(lines)


def build_calendar(entries: list[dict]) -> str:
    """Build a full VCALENDAR document from clock entries.

    Entries without a ``start`` are skipped.
    """
    parts = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Kaisho//Clock Entries//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Kaisho Time Tracking",
    ]
    for entry in entries:
        if entry.get("start"):
            parts.append(entry_to_vevent(entry))
    parts.append("END:VCALENDAR")
    return "\r\n".join(parts) + "\r\n"
