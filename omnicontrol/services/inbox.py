import re
from datetime import datetime
from pathlib import Path

from ..org.models import Heading, OrgFile
from ..org.parser import parse_org_file
from ..org.writer import write_org_file
from .kanban import add_task

INBOX_KEYWORDS: set[str] = set()
CREATED_FMT = "%Y-%m-%d %a %H:%M"
CUSTOMER_RE = re.compile(r"\[([^\]]+)\]")
TITLE_TYPE_RE = re.compile(
    r"^(EMAIL|LEAD|IDEE|NOTIZ|NOTE|IDEA)\s+", re.IGNORECASE
)

EMAIL_KEYWORDS = {"email", "von:", "from:", "betreff"}
IDEE_KEYWORDS = {"idee", "idea", "vielleicht"}
LEAD_KEYWORDS = {"lead", "anfrage", "interessent"}


def _detect_type(text: str) -> str:
    """Auto-categorize item type from text."""
    lower = text.lower()
    if any(kw in lower for kw in EMAIL_KEYWORDS):
        return "EMAIL"
    if any(kw in lower for kw in IDEE_KEYWORDS):
        return "IDEE"
    if any(kw in lower for kw in LEAD_KEYWORDS):
        return "LEAD"
    return "NOTIZ"


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
) -> dict:
    """Add an item to inbox.org with auto-categorization."""
    detected_type = item_type or _detect_type(text)
    detected_customer = customer or _extract_customer_from_text(text)

    if detected_customer:
        title = f"[{detected_customer}] {text}"
    else:
        title = text

    now = datetime.now()
    created_str = now.strftime(CREATED_FMT)

    new_heading = Heading(
        level=1,
        keyword=detected_type,
        title=title,
        properties={"CREATED": f"[{created_str}]"},
        dirty=True,
    )

    if body:
        new_heading.body = body.splitlines()

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
            updates["body"].splitlines() if updates["body"] else []
        )
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

    task = add_task(
        todos_file=todos_file,
        keywords=keywords,
        customer=customer,
        title=clean_title,
        status="TODO",
    )

    # Remove item from inbox
    org_file.headings.pop(idx)
    write_org_file(inbox_file, org_file)

    return task
