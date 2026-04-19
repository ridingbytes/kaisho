import re
from pathlib import Path

from ..org.models import Heading, OrgFile
from ..org.parser import parse_org_file
from ..org.writer import write_org_file
from ..time_utils import local_now

CUSTOMER_RE = re.compile(r"^\[([^\]]+)\]:\s*")
CREATED_FMT = "%Y-%m-%d %a %H:%M"
_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
ARCHIVE_HEADING = "Archive"
# Accept legacy German heading for backwards compatibility
_ARCHIVE_HEADINGS = {"Archive", "Archiv"}
_STATE_LOG_RE = re.compile(r'^- State "')
_STATE_CHANGE_RE = re.compile(
    r'^- State "([^"]+)"\s+from "([^"]+)"\s+'
    r'\[([^\]]+)\]'
)


def _extract_customer(title: str) -> str | None:
    """Extract [CUSTOMER] prefix from task title."""
    m = CUSTOMER_RE.match(title)
    return m.group(1) if m else None


def _state_history(heading: Heading) -> list[dict]:
    """Extract state change history from body lines.

    Returns list of dicts with keys: to, from, timestamp,
    ordered newest first.
    """
    history = []
    for line in heading.body:
        m = _STATE_CHANGE_RE.match(line.strip())
        if m:
            history.append({
                "to": m.group(1),
                "from": m.group(2),
                "timestamp": m.group(3),
            })
    return history


def _user_body(heading: Heading) -> str:
    """Return user-editable body text, excluding state log entries."""
    lines = [
        line for line in heading.body
        if not _STATE_LOG_RE.match(line)
    ]
    return "\n".join(lines).strip()


def _update_body(heading: Heading, new_body: str) -> None:
    """Replace user body lines, preserving state log entries at top."""
    log_lines = [
        line for line in heading.body
        if _STATE_LOG_RE.match(line)
    ]
    user_lines = new_body.splitlines() if new_body.strip() else []
    heading.body = log_lines + user_lines


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
        "body": _user_body(heading),
        "github_url": heading.properties.get(
            "GITHUB_URL", ""
        ),
        "state_history": _state_history(heading),
    }


def _stable_id(heading: Heading) -> str:
    """Generate a stable ID for a task heading.

    Uses the TASK_ID property if present. Otherwise
    derives a 12-char hex hash from the title and
    CREATED timestamp. Falls back to title-only hash.
    """
    import hashlib
    stored = heading.properties.get("TASK_ID")
    if stored:
        return stored
    created = heading.properties.get("CREATED", "")
    seed = f"{heading.title}|{created}"
    return hashlib.sha256(
        seed.encode()
    ).hexdigest()[:12]


def _collect_tasks(
    org_file: OrgFile,
    keywords: set[str],
) -> tuple[list[tuple[Heading, str]], bool]:
    """Collect all level-1 headings with keywords.

    Returns (list of (heading, id) tuples, migrated).
    IDs are stable hashes derived from title + created date.
    When a heading has no TASK_ID property the generated hash is
    written back so future renames do not change the ID.
    migrated is True when any heading was updated this way.
    """
    tasks = []
    migrated = False
    for h1 in org_file.headings:
        if h1.keyword in keywords:
            tid = _stable_id(h1)
            if "TASK_ID" not in h1.properties:
                h1.properties["TASK_ID"] = tid
                h1.dirty = True
                migrated = True
            tasks.append((h1, tid))
    return tasks, migrated


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


def reorder_tasks(
    todos_file: Path,
    keywords: set[str],
    task_ids: list[str],
) -> list[dict]:
    """Reorder task headings in the org file.

    task_ids specifies the desired order for a subset
    of tasks. Headings not in task_ids keep their
    relative position.
    """
    org_file = parse_org_file(todos_file, keywords)
    pairs, migrated = _collect_tasks(org_file, keywords)
    if migrated:
        write_org_file(todos_file, org_file)
    id_to_heading = {tid: h for h, tid in pairs}

    # Separate headings into reordered and others
    reordered = [
        id_to_heading[tid]
        for tid in task_ids
        if tid in id_to_heading
    ]
    reordered_set = set(id(h) for h in reordered)

    # Rebuild: place reordered headings at the
    # positions where they originally appeared
    original_positions = [
        i for i, h in enumerate(org_file.headings)
        if id(h) in reordered_set
    ]
    result = list(org_file.headings)
    for pos, heading in zip(
        original_positions, reordered,
    ):
        result[pos] = heading
        heading.dirty = True

    org_file.headings = result
    write_org_file(todos_file, org_file)

    new_pairs, _ = _collect_tasks(org_file, keywords)
    return [
        _heading_to_task(h, tid)
        for h, tid in new_pairs
    ]


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
    task_pairs, migrated = _collect_tasks(org_file, keywords)
    if migrated:
        write_org_file(todos_file, org_file)
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
    """Find a heading by stable task ID or text match."""
    task_pairs, _ = _collect_tasks(org_file, keywords)
    # Match by stable ID
    for heading, tid in task_pairs:
        if tid == task_id:
            return heading
    # Fallback: legacy numeric index (1-based)
    if task_id.isdigit():
        idx = int(task_id) - 1
        if 0 <= idx < len(task_pairs):
            return task_pairs[idx][0]
    # Last resort: text match
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
    body: str | None = None,
    github_url: str | None = None,
) -> dict:
    """Add a new task to todos.org as a flat heading."""
    if not todos_file.exists():
        todos_file.parent.mkdir(parents=True, exist_ok=True)
        todos_file.write_text("", encoding="utf-8")

    org_file = parse_org_file(todos_file, keywords)

    full_title = f"[{customer}]: {title}"
    now = local_now()
    created_str = now.strftime(CREATED_FMT)

    new_heading = Heading(
        level=1,
        keyword=status,
        title=full_title,
        tags=tags or [],
        properties={"CREATED": f"[{created_str}]"},
        body=body.splitlines() if body and body.strip() else [],
        dirty=True,
    )
    if github_url:
        new_heading.properties["GITHUB_URL"] = github_url

    # Persist the stable ID so renames don't change it.
    task_id = _stable_id(new_heading)
    new_heading.properties["TASK_ID"] = task_id

    org_file.headings.insert(0, new_heading)
    write_org_file(todos_file, org_file)

    return _heading_to_task(new_heading, task_id)


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

    now = local_now()
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
    body: str | None = None,
    github_url: str | None = None,
) -> dict:
    """Update a task's title, customer, and/or body."""
    org_file = parse_org_file(todos_file, keywords)
    heading = _find_task_heading(org_file, keywords, task_id)
    if heading is None:
        raise ValueError(f"Task not found: {task_id}")
    current_customer = _extract_customer(heading.title)
    bare_title = CUSTOMER_RE.sub("", heading.title).strip()
    new_customer = customer if customer is not None else current_customer
    new_bare = title if title is not None else bare_title
    heading.title = (
        f"[{new_customer}]: {new_bare}" if new_customer else new_bare
    )
    if body is not None:
        _update_body(heading, body)
    if github_url is not None:
        if github_url:
            heading.properties["GITHUB_URL"] = github_url
        else:
            heading.properties.pop("GITHUB_URL", None)
    heading.dirty = True
    write_org_file(todos_file, org_file)
    return _heading_to_task(heading, task_id)


def archive_task(
    todos_file: Path,
    archive_file: Path,
    keywords: set[str],
    task_id: str,
) -> bool:
    """Move a task from todos.org to archive.org.

    Places the heading under '* Archiv' with standard org archive
    properties, compatible with org-archive-subtree-default.
    """
    org_file = parse_org_file(todos_file, keywords)
    heading = _find_task_heading(org_file, keywords, task_id)
    if heading is None:
        return False

    original_keyword = heading.keyword

    # Remove from todos.org
    _remove_heading_from_tree(org_file.headings, heading)
    write_org_file(todos_file, org_file)

    # Load or create archive.org
    if not archive_file.exists():
        archive_file.parent.mkdir(parents=True, exist_ok=True)
        archive_org = OrgFile()
    else:
        archive_org = parse_org_file(archive_file, keywords)

    # Find or create the '* Archive' heading
    archive = _find_or_create_archive_heading(archive_org)

    # Prepare heading as level-2 child with archive properties
    _add_archive_properties(heading, todos_file, original_keyword)
    heading.level = 2
    heading.dirty = True
    archive.children.append(heading)
    archive.dirty = True

    write_org_file(archive_file, archive_org)
    return True


def _find_or_create_archive_heading(
    archive_org: OrgFile,
) -> Heading:
    """Return the '* Archive' heading, creating if absent.

    Accepts the legacy '* Archiv' heading for backwards
    compatibility with existing org files.
    """
    for h in archive_org.headings:
        if (
            h.level == 1
            and h.title.strip() in _ARCHIVE_HEADINGS
        ):
            return h
    archive = Heading(
        level=1,
        keyword=None,
        title=ARCHIVE_HEADING,
        dirty=True,
    )
    archive_org.headings.append(archive)
    return archive


def _add_archive_properties(
    heading: Heading,
    source_file: Path,
    original_keyword: str | None,
) -> None:
    """Add standard org archive properties to a heading."""
    now = local_now()
    day = _WEEKDAYS[now.weekday()]
    archive_time = now.strftime(f"%Y-%m-%d {day} %H:%M")
    heading.properties["ARCHIVE_TIME"] = archive_time
    heading.properties["ARCHIVE_FILE"] = _home_relative(source_file)
    heading.properties["ARCHIVE_CATEGORY"] = source_file.stem
    if original_keyword:
        heading.properties["ARCHIVE_TODO"] = original_keyword


def _home_relative(path: Path) -> str:
    """Return path as ~/... string when possible, else absolute."""
    home = Path.home()
    try:
        return "~/" + str(path.relative_to(home))
    except ValueError:
        return str(path)


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


def _archive_task_id(index: int) -> str:
    """Return a stable archive task ID for a given 1-based index."""
    return f"a{index}"


def _heading_to_archived_task(heading: Heading, task_id: str) -> dict:
    """Convert an archived Heading to a task dict with archive metadata."""
    task = _heading_to_task(heading, task_id)
    task["archived_at"] = heading.properties.get("ARCHIVE_TIME", "")
    task["archive_status"] = heading.properties.get(
        "ARCHIVE_TODO", heading.keyword or ""
    )
    return task


def list_archived_tasks(
    archive_file: Path,
    keywords: set[str],
    clocks_file: Path | None = None,
) -> list[dict]:
    """List all tasks from the archive file.

    When clocks_file is provided each task includes a
    clock_count field with the number of referencing entries.
    """
    if not archive_file.exists():
        return []
    archive_org = parse_org_file(archive_file, keywords)
    archive_root = _find_or_create_archive_heading(archive_org)
    tasks = []
    for i, h in enumerate(archive_root.children):
        task = _heading_to_archived_task(h, _archive_task_id(i + 1))
        task_id = h.properties.get("TASK_ID", "")
        if clocks_file and task_id:
            from .clocks import count_task_clock_entries
            task["clock_count"] = count_task_clock_entries(
                clocks_file, task_id
            )
        else:
            task["clock_count"] = 0
        tasks.append(task)
    return tasks


def delete_archived_task(
    archive_file: Path,
    keywords: set[str],
    task_id: str,
) -> bool:
    """Permanently remove a task from the archive.

    Returns False if the task was not found.
    task_id must be a positional archive ID (e.g. 'a3').
    """
    if not archive_file.exists():
        return False
    if not task_id.startswith("a") or not task_id[1:].isdigit():
        return False
    archive_org = parse_org_file(archive_file, keywords)
    archive_root = _find_or_create_archive_heading(archive_org)
    idx = int(task_id[1:]) - 1
    if idx < 0 or idx >= len(archive_root.children):
        return False
    archive_root.children.pop(idx)
    archive_root.dirty = True
    write_org_file(archive_file, archive_org)
    return True


def _strip_archive_properties(heading: Heading) -> None:
    """Remove ARCHIVE_* properties from a heading in place."""
    for key in list(heading.properties):
        if key.startswith("ARCHIVE_"):
            del heading.properties[key]


def unarchive_task(
    archive_file: Path,
    todos_file: Path,
    keywords: set[str],
    task_id: str,
) -> bool:
    """Move a task from archive.org back to todos.org.

    Returns False if the task was not found in the archive.
    """
    if not archive_file.exists():
        return False
    archive_org = parse_org_file(archive_file, keywords)
    archive_root = _find_or_create_archive_heading(archive_org)

    # Resolve index from task_id (e.g. "a3" -> index 2)
    if not task_id.startswith("a") or not task_id[1:].isdigit():
        return False
    idx = int(task_id[1:]) - 1
    if idx < 0 or idx >= len(archive_root.children):
        return False

    heading = archive_root.children[idx]
    archive_root.children.pop(idx)
    archive_root.dirty = True
    write_org_file(archive_file, archive_org)

    # Restore heading for todos.org
    _strip_archive_properties(heading)
    original_keyword = heading.keyword
    if not original_keyword:
        heading.keyword = "TODO"
    heading.level = 1
    heading.dirty = True

    if not todos_file.exists():
        todos_file.parent.mkdir(parents=True, exist_ok=True)
        todos_file.write_text("", encoding="utf-8")
    todos_org = parse_org_file(todos_file, keywords)
    todos_org.headings.append(heading)
    write_org_file(todos_file, todos_org)
    return True
