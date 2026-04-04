import re
from datetime import datetime
from pathlib import Path

from ..org.models import Heading, OrgFile
from ..org.parser import KEYWORDS as DEFAULT_KEYWORDS  # noqa: F401
from ..org.parser import parse_org_file
from ..org.writer import write_org_file

CUSTOMER_RE = re.compile(r"^\[([^\]]+)\]\s*")
CREATED_FMT = "%Y-%m-%d %a %H:%M"


def _extract_customer(title: str) -> str | None:
    """Extract [CUSTOMER] prefix from task title."""
    m = CUSTOMER_RE.match(title)
    return m.group(1) if m else None


def _heading_to_task(heading: Heading, task_id: str) -> dict:
    """Convert a Heading to a task dict."""
    customer = _extract_customer(heading.title)
    created = heading.properties.get("CREATED", "")
    return {
        "id": task_id,
        "customer": customer,
        "title": heading.title,
        "status": heading.keyword,
        "tags": list(heading.tags),
        "properties": dict(heading.properties),
        "created": created,
    }


def _collect_tasks(
    org_file: OrgFile,
    keywords: set[str],
) -> list[tuple[Heading, str]]:
    """Collect all level-2 headings with keywords as tasks.

    Returns list of (heading, id) tuples.
    """
    tasks = []
    idx = 1
    for h1 in org_file.headings:
        for h2 in h1.children:
            if h2.keyword in keywords:
                tasks.append((h2, str(idx)))
                idx += 1
    return tasks


def _matches_filter(
    task: dict,
    status: list[str] | None,
    customer: str | None,
    tag: str | None,
    include_done: bool,
    done_states: set[str],
) -> bool:
    """Check if a task matches the given filters."""
    if not include_done and task["status"] in done_states:
        return False
    if status and task["status"] not in status:
        return False
    if customer and task["customer"] != customer:
        return False
    if tag and tag not in task["tags"]:
        return False
    return True


def _get_done_states(keywords: set[str]) -> set[str]:
    """Determine done states from keywords set."""
    return {"DONE", "CANCELLED"} & keywords


def list_tasks(
    todos_file: Path,
    keywords: set[str],
    status: list[str] | None = None,
    customer: str | None = None,
    tag: str | None = None,
    include_done: bool = False,
) -> list[dict]:
    """List tasks from todos.org with optional filters."""
    if not todos_file.exists():
        return []
    org_file = parse_org_file(todos_file, keywords)
    task_pairs = _collect_tasks(org_file, keywords)
    done_states = _get_done_states(keywords)
    result = []
    for heading, task_id in task_pairs:
        task = _heading_to_task(heading, task_id)
        if _matches_filter(
            task, status, customer, tag, include_done, done_states
        ):
            result.append(task)
    return result


def _find_task_heading(
    org_file: OrgFile,
    keywords: set[str],
    task_id: str,
) -> Heading | None:
    """Find a heading by task ID (1-based index or text match)."""
    task_pairs = _collect_tasks(org_file, keywords)
    # Try numeric ID first
    if task_id.isdigit():
        idx = int(task_id) - 1
        if 0 <= idx < len(task_pairs):
            return task_pairs[idx][0]
    # Try text match
    lower_id = task_id.lower()
    for heading, _ in task_pairs:
        if lower_id in heading.title.lower():
            return heading
    return None


def add_task(
    todos_file: Path,
    keywords: set[str],
    customer: str,
    title: str,
    status: str = "TODO",
    tags: list[str] | None = None,
) -> dict:
    """Add a new task to todos.org under the customer's group."""
    if not todos_file.exists():
        todos_file.parent.mkdir(parents=True, exist_ok=True)
        todos_file.write_text("", encoding="utf-8")

    org_file = parse_org_file(todos_file, keywords)

    full_title = f"[{customer}] {title}"
    now = datetime.now()
    created_str = now.strftime(CREATED_FMT)

    new_heading = Heading(
        level=2,
        keyword=status,
        title=full_title,
        tags=tags or [],
        properties={"CREATED": f"[{created_str}]"},
        dirty=True,
    )

    parent = _find_or_create_customer_group(org_file, customer)
    parent.children.append(new_heading)

    write_org_file(todos_file, org_file)

    idx = len(_collect_tasks(org_file, keywords))
    return _heading_to_task(new_heading, str(idx))


def _find_or_create_customer_group(
    org_file: OrgFile, customer: str
) -> Heading:
    """Find level-1 heading for customer or create it."""
    for h in org_file.headings:
        if h.title.strip().upper() == customer.upper():
            return h
    new_group = Heading(
        level=1,
        keyword=None,
        title=customer,
        dirty=True,
    )
    org_file.headings.append(new_group)
    return new_group


def move_task(
    todos_file: Path,
    keywords: set[str],
    task_id: str,
    new_status: str,
) -> dict:
    """Change the status of a task."""
    org_file = parse_org_file(todos_file, keywords)
    heading = _find_task_heading(org_file, keywords, task_id)
    if heading is None:
        raise ValueError(f"Task not found: {task_id}")

    now = datetime.now()
    old_status = heading.keyword or "TODO"
    log_entry = (
        f'- State "{new_status}"'
        f'       from "{old_status}"'
        f'       [{now.strftime(CREATED_FMT)}]'
    )
    heading.body.insert(0, log_entry)
    heading.keyword = new_status
    heading.dirty = True

    write_org_file(todos_file, org_file)
    return _heading_to_task(heading, task_id)


def set_task_tags(
    todos_file: Path,
    keywords: set[str],
    task_id: str,
    tags: list[str],
) -> dict:
    """Set tags on a task (replaces existing tags)."""
    org_file = parse_org_file(todos_file, keywords)
    heading = _find_task_heading(org_file, keywords, task_id)
    if heading is None:
        raise ValueError(f"Task not found: {task_id}")

    heading.tags = tags
    heading.dirty = True

    write_org_file(todos_file, org_file)
    return _heading_to_task(heading, task_id)


def update_task(
    todos_file: Path,
    keywords: set[str],
    task_id: str,
    title: str | None = None,
    customer: str | None = None,
) -> dict:
    """Update a task's title and/or customer."""
    org_file = parse_org_file(todos_file, keywords)
    heading = _find_task_heading(org_file, keywords, task_id)
    if heading is None:
        raise ValueError(f"Task not found: {task_id}")
    current_customer = _extract_customer(heading.title)
    bare_title = CUSTOMER_RE.sub("", heading.title).strip()
    new_customer = customer if customer is not None else current_customer
    new_bare = title if title is not None else bare_title
    heading.title = (
        f"[{new_customer}] {new_bare}" if new_customer else new_bare
    )
    heading.dirty = True
    write_org_file(todos_file, org_file)
    return _heading_to_task(heading, task_id)


def archive_task(
    todos_file: Path,
    archive_file: Path,
    keywords: set[str],
    task_id: str,
) -> bool:
    """Move a task from todos.org to archive.org."""
    org_file = parse_org_file(todos_file, keywords)
    heading = _find_task_heading(org_file, keywords, task_id)
    if heading is None:
        return False

    # Remove from todos.org
    _remove_heading_from_tree(org_file.headings, heading)
    write_org_file(todos_file, org_file)

    # Append to archive.org
    if not archive_file.exists():
        archive_file.parent.mkdir(parents=True, exist_ok=True)
        archive_org = OrgFile()
    else:
        archive_org = parse_org_file(archive_file, keywords)

    heading.dirty = True
    archive_org.headings.append(heading)
    write_org_file(archive_file, archive_org)
    return True


def _remove_heading_from_tree(
    headings: list[Heading], target: Heading
) -> bool:
    """Recursively remove a heading from the tree."""
    for i, h in enumerate(headings):
        if h is target:
            headings.pop(i)
            return True
        if _remove_heading_from_tree(h.children, target):
            return True
    return False
