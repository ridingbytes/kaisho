import re
from pathlib import Path

from ..org.models import Heading, OrgFile
from ..org.parser import parse_org_file
from ..org.writer import write_org_file
from .kanban import add_task
from . import notes as notes_service
from ..time_utils import local_now

INBOX_KEYWORDS: set[str] = set()
CREATED_FMT = "%Y-%m-%d %a %H:%M"


def _escape_body(text: str) -> list[str]:
    """Split text into lines, escaping any that start
    with * (org headings, markdown bold, bullets). Adds
    a leading space so the org parser treats them as
    body text rather than new headings."""
    lines = []
    for line in text.splitlines():
        if line.startswith("*"):
            lines.append(" " + line)
        else:
            lines.append(line)
    return lines


CUSTOMER_RE = re.compile(r"\[([^\]]+)\]")
TITLE_TYPE_RE = re.compile(
    r"^(EMAIL|LEAD|IDEA|IDEE|NOTE|NOTIZ)\s+",
    re.IGNORECASE,
)

EMAIL_KEYWORDS = {
    "email", "from:", "subject:",
    # Legacy German keywords
    "von:", "betreff",
}
IDEA_KEYWORDS = {
    "idea",
    # Legacy German keywords
    "idee", "vielleicht",
}
LEAD_KEYWORDS = {
    "lead", "inquiry",
    # Legacy German keywords
    "anfrage", "interessent",
}


def _detect_type(text: str) -> str:
    """Auto-categorize item type from text."""
    lower = text.lower()
    if any(kw in lower for kw in EMAIL_KEYWORDS):
        return "EMAIL"
    if any(kw in lower for kw in IDEA_KEYWORDS):
        return "IDEA"
    if any(kw in lower for kw in LEAD_KEYWORDS):
        return "LEAD"
    return "NOTE"


def _extract_type(heading: Heading) -> str:
    """Extract type from heading: property, title prefix, or auto-detect."""
    props = heading.properties
    if "TYPE" in props:
        return props["TYPE"].upper()
    # Check title prefix (e.g. "LEAD [CUSTOMER] ...")
    m = TITLE_TYPE_RE.match(heading.title)
    if m:
        return m.group(1).upper()
    # Fall back to keyword or auto-detect
    if heading.keyword:
        return heading.keyword.upper()
    return _detect_type(heading.title)


def _extract_customer(heading: Heading) -> str | None:
    """Extract [CUSTOMER] name from heading title."""
    m = CUSTOMER_RE.search(heading.title)
    return m.group(1) if m else None


def _extract_customer_from_text(text: str) -> str | None:
    """Extract [CUSTOMER] name from plain text."""
    m = CUSTOMER_RE.search(text)
    return m.group(1) if m else None


def _heading_to_item(heading: Heading, item_id: str) -> dict:
    """Convert inbox heading to item dict."""
    props = heading.properties
    item_type = _extract_type(heading)
    customer = _extract_customer(heading)
    return {
        "id": item_id,
        "type": item_type,
        "customer": customer,
        "title": heading.title.strip(),
        "body": "\n".join(heading.body).strip(),
        "created": props.get("CREATED", ""),
        "channel": props.get("CHANNEL", ""),
        "direction": props.get("DIRECTION", ""),
        "properties": dict(props),
    }


def list_items(inbox_file: Path) -> list[dict]:
    """List all inbox items."""
    if not inbox_file.exists():
        return []
    org_file = parse_org_file(inbox_file, INBOX_KEYWORDS)
    items = []
    for idx, heading in enumerate(org_file.headings, start=1):
        items.append(_heading_to_item(heading, str(idx)))
    return items


def add_item(
    inbox_file: Path,
    text: str,
    item_type: str | None = None,
    customer: str | None = None,
    body: str | None = None,
    channel: str | None = None,
    direction: str | None = None,
) -> dict:
    """Add an item to inbox.org with auto-categorization."""
    detected_type = item_type or _detect_type(text)
    detected_customer = customer or _extract_customer_from_text(text)

    if detected_customer:
        title = f"[{detected_customer}] {text}"
    else:
        title = text

    now = local_now()
    created_str = now.strftime(CREATED_FMT)

    new_heading = Heading(
        level=1,
        keyword=detected_type,
        title=title,
        properties={"CREATED": f"[{created_str}]"},
        dirty=True,
    )

    if body:
        new_heading.body = _escape_body(body)

    if channel:
        new_heading.properties["CHANNEL"] = channel
    if direction:
        new_heading.properties["DIRECTION"] = direction

    if not inbox_file.exists():
        inbox_file.parent.mkdir(parents=True, exist_ok=True)
        org_file = OrgFile()
    else:
        org_file = parse_org_file(inbox_file, INBOX_KEYWORDS)

    org_file.headings.append(new_heading)
    write_org_file(inbox_file, org_file)

    item_id = str(len(org_file.headings))
    return _heading_to_item(new_heading, item_id)


def update_item(
    inbox_file: Path,
    item_id: str,
    updates: dict,
) -> dict:
    """Update title, type, customer, and/or body of an inbox item."""
    if not inbox_file.exists():
        raise ValueError("Item not found")
    org_file = parse_org_file(inbox_file, INBOX_KEYWORDS)
    idx = int(item_id) - 1
    if idx < 0 or idx >= len(org_file.headings):
        raise ValueError("Item not found")
    heading = org_file.headings[idx]
    heading.dirty = True
    if "title" in updates:
        heading.title = updates["title"]
    if "type" in updates:
        heading.keyword = updates["type"].upper() if updates["type"] else None
        heading.properties["TYPE"] = updates["type"].upper()
    if "customer" in updates:
        new_customer = updates["customer"]
        bare = re.sub(r"\[([^\]]+)\]\s*", "", heading.title).strip()
        if new_customer:
            heading.title = f"[{new_customer}] {bare}"
        else:
            heading.title = bare
    if "body" in updates:
        heading.body = (
            _escape_body(updates["body"])
            if updates["body"] else []
        )
    if "channel" in updates:
        if updates["channel"]:
            heading.properties["CHANNEL"] = updates["channel"]
        else:
            heading.properties.pop("CHANNEL", None)
    if "direction" in updates:
        if updates["direction"]:
            heading.properties["DIRECTION"] = updates["direction"]
        else:
            heading.properties.pop("DIRECTION", None)
    write_org_file(inbox_file, org_file)
    return _heading_to_item(heading, item_id)


def promote_to_task(
    inbox_file: Path,
    todos_file: Path,
    keywords: set[str],
    item_id: str,
    customer: str,
) -> dict:
    """Promote an inbox item to a task in todos.org."""
    if not inbox_file.exists():
        raise ValueError("Inbox file not found")

    org_file = parse_org_file(inbox_file, INBOX_KEYWORDS)
    idx = int(item_id) - 1
    if idx < 0 or idx >= len(org_file.headings):
        raise ValueError(f"Item not found: {item_id}")

    heading = org_file.headings[idx]
    title = heading.title.strip()

    # Remove [CUSTOMER] prefix if present, will be re-added by add_task
    clean_title = re.sub(r"^\[[^\]]+\]\s*", "", title)

    body = "\n".join(heading.body).strip() or None

    task = add_task(
        todos_file=todos_file,
        keywords=keywords,
        customer=customer,
        title=clean_title,
        status="TODO",
        body=body,
    )

    # Remove item from inbox
    org_file.headings.pop(idx)
    write_org_file(inbox_file, org_file)

    return task


def _load_heading(
    inbox_file: Path, item_id: str
) -> tuple[OrgFile, int, Heading]:
    """Parse inbox file and return (org_file, idx, heading)."""
    if not inbox_file.exists():
        raise ValueError("Inbox file not found")
    org_file = parse_org_file(inbox_file, INBOX_KEYWORDS)
    idx = int(item_id) - 1
    if idx < 0 or idx >= len(org_file.headings):
        raise ValueError(f"Item not found: {item_id}")
    return org_file, idx, org_file.headings[idx]


def move_to_note(
    inbox_file: Path,
    notes_file: Path,
    item_id: str,
) -> dict:
    """Create a note from an inbox item then delete it from inbox.

    Returns the created note dict.
    """
    org_file, idx, heading = _load_heading(inbox_file, item_id)

    title = re.sub(r"^\[[^\]]+\]\s*", "", heading.title.strip())
    customer = _extract_customer(heading)
    body = "\n".join(heading.body).strip() or ""

    note = notes_service.add_note(
        notes_file=notes_file,
        title=title,
        body=body,
        customer=customer,
    )

    org_file.headings.pop(idx)
    write_org_file(inbox_file, org_file)

    return note


def move_to_kb(
    inbox_file: Path,
    kb_dir: Path,
    item_id: str,
    filename: str,
) -> dict:
    """Write inbox item body as a markdown KB file then delete it.

    filename must end with '.md'.
    Returns a dict with the file path.
    """
    if not filename.endswith(".md"):
        raise ValueError("filename must end with .md")

    org_file, idx, heading = _load_heading(inbox_file, item_id)

    props = heading.properties
    title = re.sub(r"^\[[^\]]+\]\s*", "", heading.title.strip())
    customer = _extract_customer(heading)
    body = "\n".join(heading.body).strip()

    # Build metadata frontmatter
    meta_lines = []
    if props.get("CREATED"):
        meta_lines.append(
            f"date: {props['CREATED'].strip('[]')}"
        )
    if customer:
        meta_lines.append(f"customer: {customer}")
    item_type = _extract_type(heading)
    if item_type:
        meta_lines.append(f"type: {item_type}")
    if props.get("CHANNEL"):
        meta_lines.append(f"channel: {props['CHANNEL']}")
    if props.get("DIRECTION"):
        meta_lines.append(
            f"direction: {props['DIRECTION']}"
        )
    if heading.keyword:
        meta_lines.append(f"status: {heading.keyword}")

    header = f"# {title}\n\n"
    if meta_lines:
        header += "\n".join(meta_lines) + "\n---\n\n"

    content = header + body + "\n" if body else header

    kb_dir.mkdir(parents=True, exist_ok=True)
    dest = kb_dir / filename
    dest.write_text(content, encoding="utf-8")

    org_file.headings.pop(idx)
    write_org_file(inbox_file, org_file)

    return {"path": str(dest)}
