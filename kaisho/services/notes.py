import re
from pathlib import Path

from ..org.models import Heading, OrgFile
from ..org.parser import parse_org_file
from ..org.writer import write_org_file
from ..time_utils import local_now

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
        "task_id": heading.properties.get("TASK_ID") or None,
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


def reorder_notes(
    notes_file: Path, note_ids: list[str],
) -> list[dict]:
    """Reorder notes to match the given ID sequence.

    IDs are 1-based indices into the current heading
    list. Headings not in ``note_ids`` are appended at
    the end in their original order.
    """
    if not notes_file.exists():
        return []
    org_file = parse_org_file(
        notes_file, NOTES_KEYWORDS,
    )
    old = list(org_file.headings)
    by_id = {str(i): h for i, h in enumerate(old, 1)}
    ordered = [
        by_id[nid] for nid in note_ids
        if nid in by_id
    ]
    seen = set(note_ids)
    for i, h in enumerate(old, 1):
        if str(i) not in seen:
            ordered.append(h)
    org_file.headings = ordered
    write_org_file(notes_file, org_file)
    return [
        _heading_to_note(h, str(i))
        for i, h in enumerate(ordered, start=1)
    ]


def add_note(
    notes_file: Path,
    title: str,
    body: str = "",
    customer: str | None = None,
    tags: list[str] | None = None,
    task_id: str | None = None,
) -> dict:
    """Append a new note to notes.org and return its dict."""
    now = local_now()
    created_str = now.strftime(CREATED_FMT)

    heading_title = f"[{customer}] {title}" if customer else title
    body_lines: list[str] = ([""] + body.splitlines()) if body else []

    props: dict[str, str] = {"CREATED": f"[{created_str}]"}
    if task_id:
        props["TASK_ID"] = task_id

    new_heading = Heading(
        level=1,
        keyword=None,
        title=heading_title,
        tags=tags or [],
        properties=props,
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
    if "task_id" in updates:
        tid = updates["task_id"]
        if tid:
            heading.properties["TASK_ID"] = tid
        else:
            heading.properties.pop("TASK_ID", None)
    write_org_file(notes_file, org_file)
    return _heading_to_note(heading, note_id)


def _load_heading(
    notes_file: Path, note_id: str
) -> tuple[OrgFile, int, Heading]:
    """Parse notes file and return (org_file, idx, heading)."""
    if not notes_file.exists():
        raise ValueError("Notes file not found")
    org_file = parse_org_file(notes_file, NOTES_KEYWORDS)
    idx = int(note_id) - 1
    if idx < 0 or idx >= len(org_file.headings):
        raise ValueError(f"Note not found: {note_id}")
    return org_file, idx, org_file.headings[idx]


def promote_to_task(
    notes_file: Path,
    note_id: str,
    tasks_backend,
    customer: str,
) -> dict:
    """Promote a note to a task. Removes the note from notes.org."""
    org_file, idx, heading = _load_heading(notes_file, note_id)

    title = _strip_customer(heading.title.strip())
    body = "\n".join(heading.body).strip() or None

    task = tasks_backend.add_task(
        customer=customer, title=title, status="TODO", body=body
    )

    org_file.headings.pop(idx)
    write_org_file(notes_file, org_file)

    return task


def move_to_kb(
    notes_file: Path,
    kb_dir: Path,
    note_id: str,
    filename: str,
) -> dict:
    """Write note body as a markdown KB file then delete it.

    Returns a dict with the file path.
    """
    if not filename.endswith(".md"):
        raise ValueError("filename must end with .md")

    org_file, idx, heading = _load_heading(notes_file, note_id)

    props = heading.properties
    title = _strip_customer(heading.title.strip())
    customer = _extract_customer(heading.title.strip())
    body = "\n".join(heading.body).strip()

    meta_lines = []
    if props.get("CREATED"):
        meta_lines.append(
            f"date: {props['CREATED'].strip('[]')}"
        )
    if customer:
        meta_lines.append(f"customer: {customer}")
    if heading.tags:
        meta_lines.append(
            f"tags: {', '.join(heading.tags)}"
        )
    if props.get("TASK_ID"):
        meta_lines.append(f"task_id: {props['TASK_ID']}")

    header = f"# {title}\n\n"
    if meta_lines:
        header += "\n".join(meta_lines) + "\n---\n\n"

    content = header + body + "\n" if body else header

    kb_dir.mkdir(parents=True, exist_ok=True)
    dest = kb_dir / filename
    dest.write_text(content, encoding="utf-8")

    org_file.headings.pop(idx)
    write_org_file(notes_file, org_file)

    return {"path": str(dest)}


def archive_note(notes_file: Path, note_id: str) -> bool:
    """Delete a note (archive). Returns False if not found."""
    return delete_note(notes_file, note_id)
