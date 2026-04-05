import re
from datetime import datetime
from pathlib import Path

from ..org.models import Heading, OrgFile
from ..org.parser import parse_org_file
from ..org.writer import write_org_file

NOTES_KEYWORDS: set[str] = set()
CREATED_FMT = "%Y-%m-%d %a %H:%M"
CUSTOMER_RE = re.compile(r"^\[([^\]]+)\]\s*")


def _extract_customer(title: str) -> str | None:
    """Extract [CUSTOMER] prefix from note title."""
    m = CUSTOMER_RE.match(title)
    return m.group(1) if m else None


def _strip_customer(title: str) -> str:
    """Remove [CUSTOMER] prefix from title."""
    return CUSTOMER_RE.sub("", title).strip()


def _heading_to_note(heading: Heading, note_id: str) -> dict:
    """Convert org heading to note dict."""
    raw_title = heading.title.strip()
    customer = _extract_customer(raw_title)
    title = _strip_customer(raw_title)
    body = "\n".join(heading.body).strip()
    return {
        "id": note_id,
        "title": title,
        "customer": customer,
        "body": body,
        "tags": list(heading.tags),
        "created": heading.properties.get("CREATED", ""),
    }


def list_notes(notes_file: Path) -> list[dict]:
    """Return all notes ordered oldest-first."""
    if not notes_file.exists():
        return []
    org_file = parse_org_file(notes_file, NOTES_KEYWORDS)
    return [
        _heading_to_note(h, str(i))
        for i, h in enumerate(org_file.headings, start=1)
    ]


def add_note(
    notes_file: Path,
    title: str,
    body: str = "",
    customer: str | None = None,
    tags: list[str] | None = None,
) -> dict:
    """Append a new note to notes.org and return its dict."""
    now = datetime.now()
    created_str = now.strftime(CREATED_FMT)

    heading_title = f"[{customer}] {title}" if customer else title
    body_lines: list[str] = ([""] + body.splitlines()) if body else []

    new_heading = Heading(
        level=1,
        keyword=None,
        title=heading_title,
        tags=tags or [],
        properties={"CREATED": f"[{created_str}]"},
        body=body_lines,
        dirty=True,
    )

    if not notes_file.exists():
        notes_file.parent.mkdir(parents=True, exist_ok=True)
        org_file = OrgFile()
    else:
        org_file = parse_org_file(notes_file, NOTES_KEYWORDS)

    org_file.headings.append(new_heading)
    write_org_file(notes_file, org_file)

    note_id = str(len(org_file.headings))
    return _heading_to_note(new_heading, note_id)


def delete_note(notes_file: Path, note_id: str) -> bool:
    """Delete a note by 1-based ID. Returns False if not found."""
    if not notes_file.exists():
        return False
    org_file = parse_org_file(notes_file, NOTES_KEYWORDS)
    idx = int(note_id) - 1
    if idx < 0 or idx >= len(org_file.headings):
        return False
    org_file.headings.pop(idx)
    write_org_file(notes_file, org_file)
    return True


def update_note(
    notes_file: Path,
    note_id: str,
    updates: dict,
) -> dict:
    """Update title, body, customer, and/or tags of a note."""
    if not notes_file.exists():
        raise ValueError("Note not found")
    org_file = parse_org_file(notes_file, NOTES_KEYWORDS)
    idx = int(note_id) - 1
    if idx < 0 or idx >= len(org_file.headings):
        raise ValueError("Note not found")
    heading = org_file.headings[idx]
    heading.dirty = True
    if "title" in updates or "customer" in updates:
        bare = _strip_customer(heading.title.strip())
        new_title = updates.get("title", bare)
        new_customer = updates.get(
            "customer", _extract_customer(heading.title.strip())
        )
        if new_customer:
            heading.title = f"[{new_customer}] {new_title}"
        else:
            heading.title = new_title
    if "body" in updates:
        heading.body = (
            updates["body"].splitlines() if updates["body"] else []
        )
    if "tags" in updates:
        heading.tags = list(updates["tags"])
    write_org_file(notes_file, org_file)
    return _heading_to_note(heading, note_id)


def promote_to_task(
    notes_file: Path,
    note_id: str,
    tasks_backend,
    customer: str,
) -> dict:
    """Promote a note to a task. Removes the note from notes.org."""
    if not notes_file.exists():
        raise ValueError("Notes file not found")

    org_file = parse_org_file(notes_file, NOTES_KEYWORDS)
    idx = int(note_id) - 1
    if idx < 0 or idx >= len(org_file.headings):
        raise ValueError(f"Note not found: {note_id}")

    heading = org_file.headings[idx]
    title = _strip_customer(heading.title.strip())

    body = "\n".join(heading.body).strip() or None

    task = tasks_backend.add_task(
        customer=customer, title=title, status="TODO", body=body
    )

    org_file.headings.pop(idx)
    write_org_file(notes_file, org_file)

    return task
