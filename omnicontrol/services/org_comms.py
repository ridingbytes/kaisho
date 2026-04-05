"""Org-mode based communications log service.

Stores inbound/outbound communication history in comms.org.
Each heading represents one entry; metadata is stored in properties.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

from ..org.models import Heading, OrgFile
from ..org.parser import parse_org_file
from ..org.writer import write_org_file

COMMS_KEYWORDS: set[str] = set()
CHANNELS = {"email", "phone", "chat", "other"}
DIRECTIONS = {"in", "out"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _heading_to_comm(heading: Heading, comm_id: int) -> dict:
    """Convert a Heading to a communication entry dict."""
    props = heading.properties
    raw_tags = props.get("TAGS", "[]")
    try:
        tags = json.loads(raw_tags)
    except (json.JSONDecodeError, ValueError):
        tags = []
    return {
        "id": comm_id,
        "ts": props.get("TS", ""),
        "customer": props.get("CUSTOMER") or None,
        "direction": props.get("DIRECTION", "in"),
        "channel": props.get("CHANNEL", "other"),
        "subject": heading.title.strip(),
        "body": "\n".join(heading.body).strip(),
        "contact": props.get("CONTACT", ""),
        "type": props.get("TYPE", ""),
        "tags": tags,
    }


def _load_org(comms_file: Path) -> OrgFile:
    if not comms_file.exists():
        return OrgFile()
    return parse_org_file(comms_file, COMMS_KEYWORDS)


def _save_org(comms_file: Path, org_file: OrgFile) -> None:
    if not comms_file.exists():
        comms_file.parent.mkdir(parents=True, exist_ok=True)
    write_org_file(comms_file, org_file)


def list_comms(
    comms_file: Path,
    customer: str | None = None,
    channel: str | None = None,
    direction: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """List communication entries, most recent first."""
    org_file = _load_org(comms_file)
    result = []
    for i, h in enumerate(reversed(org_file.headings), start=1):
        comm = _heading_to_comm(
            h, len(org_file.headings) - i + 1
        )
        if customer and comm["customer"] != customer:
            continue
        if channel and comm["channel"] != channel:
            continue
        if direction and comm["direction"] != direction:
            continue
        result.append(comm)
        if len(result) >= limit:
            break
    return result


def log_comm(
    comms_file: Path,
    subject: str,
    direction: str,
    channel: str,
    customer: str | None = None,
    body: str = "",
    contact: str = "",
    ts: str | None = None,
    comm_type: str = "",
    tags: list[str] | None = None,
) -> dict:
    """Add a communication entry. Returns the created record."""
    if direction not in DIRECTIONS:
        raise ValueError(
            f"direction must be one of {sorted(DIRECTIONS)}"
        )
    if channel not in CHANNELS:
        raise ValueError(
            f"channel must be one of {sorted(CHANNELS)}"
        )
    ts = ts or _now_iso()
    props: dict[str, str] = {
        "TS": ts,
        "DIRECTION": direction,
        "CHANNEL": channel,
    }
    if customer:
        props["CUSTOMER"] = customer
    if contact:
        props["CONTACT"] = contact
    if comm_type:
        props["TYPE"] = comm_type
    props["TAGS"] = json.dumps(tags or [])

    new_heading = Heading(
        level=1,
        keyword=None,
        title=subject,
        properties=props,
        body=body.splitlines() if body else [],
        dirty=True,
    )

    org_file = _load_org(comms_file)
    org_file.headings.append(new_heading)
    _save_org(comms_file, org_file)

    comm_id = len(org_file.headings)
    return _heading_to_comm(new_heading, comm_id)


def get_comm(comms_file: Path, comm_id: int) -> dict | None:
    """Return a single communication record by 1-based id."""
    org_file = _load_org(comms_file)
    idx = comm_id - 1
    if idx < 0 or idx >= len(org_file.headings):
        return None
    return _heading_to_comm(org_file.headings[idx], comm_id)


def update_comm(
    comms_file: Path,
    comm_id: int,
    updates: dict,
) -> dict | None:
    """Update fields of a communication entry."""
    org_file = _load_org(comms_file)
    idx = comm_id - 1
    if idx < 0 or idx >= len(org_file.headings):
        return None
    heading = org_file.headings[idx]
    heading.dirty = True
    if "subject" in updates:
        heading.title = updates["subject"]
    if "body" in updates:
        heading.body = (
            updates["body"].splitlines() if updates["body"] else []
        )
    if "customer" in updates:
        if updates["customer"]:
            heading.properties["CUSTOMER"] = updates["customer"]
        else:
            heading.properties.pop("CUSTOMER", None)
    if "contact" in updates:
        heading.properties["CONTACT"] = updates["contact"]
    if "type" in updates:
        heading.properties["TYPE"] = updates["type"]
    if "tags" in updates:
        heading.properties["TAGS"] = json.dumps(
            updates["tags"] or []
        )
    _save_org(comms_file, org_file)
    return _heading_to_comm(heading, comm_id)


def delete_comm(comms_file: Path, comm_id: int) -> bool:
    """Delete a communication record. Returns False if not found."""
    org_file = _load_org(comms_file)
    idx = comm_id - 1
    if idx < 0 or idx >= len(org_file.headings):
        return False
    org_file.headings.pop(idx)
    _save_org(comms_file, org_file)
    return True


def search_comms(
    comms_file: Path,
    query: str,
    limit: int = 50,
) -> list[dict]:
    """Search subject and body for query text."""
    q = query.lower()
    org_file = _load_org(comms_file)
    result = []
    for i, h in enumerate(reversed(org_file.headings), start=1):
        comm_id = len(org_file.headings) - i + 1
        subject = h.title.lower()
        body = "\n".join(h.body).lower()
        if q in subject or q in body:
            result.append(_heading_to_comm(h, comm_id))
        if len(result) >= limit:
            break
    return result
