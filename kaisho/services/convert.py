"""Convert data between Kaisho backends.

Reads all entities from a source backend and writes them
to a target backend. Handles dependency ordering:
customers first, then tasks, clocks, inbox, notes.
"""
import re
from datetime import date
from pathlib import Path

from ..backends import Backend

_CUSTOMER_PREFIX_RE = re.compile(r"^\[[^\]]+\]:\s*")
_STATUS_KEYWORDS = {
    "TODO", "NEXT", "IN-PROGRESS", "WAIT",
    "DONE", "CANCELLED",
}
_INBOX_TYPE_RE = re.compile(r"^[A-Za-z][\w-]*$")


def convert_backend(
    source: Backend,
    target: Backend,
) -> dict[str, int]:
    """Convert all data from source to target.

    Returns a summary dict mapping entity names to the
    number of records converted.

    >>> convert_backend(empty_src, empty_tgt)
    {'customers': 0, 'tasks': 0, 'clocks': 0, \
'inbox': 0, 'notes': 0}
    """
    summary: dict[str, int] = {}

    summary["customers"] = _convert_customers(
        source, target,
    )
    summary["tasks"] = _convert_tasks(
        source, target,
    )
    summary["clocks"] = _convert_clocks(
        source, target,
    )
    summary["inbox"] = _convert_inbox(
        source, target,
    )
    summary["notes"] = _convert_notes(
        source, target,
    )
    return summary


def _convert_customers(
    source: Backend, target: Backend,
) -> int:
    """Copy customers and their contracts.

    Skips customers that already exist in target.
    """
    customers = source.customers.list_customers(
        include_inactive=True,
    )
    count = 0
    for c in customers:
        try:
            target.customers.add_customer(
                name=c["name"],
                status=c.get("status", "active"),
                customer_type=c.get("type", ""),
                budget=c.get("budget", 0),
                color=c.get("color", ""),
                repo=c.get("repo"),
                tags=c.get("tags"),
            )
        except ValueError:
            continue
        for ct in c.get("contracts", []):
            try:
                target.customers.add_contract(
                    name=c["name"],
                    contract_name=ct["name"],
                    budget=ct.get("budget", 0),
                    start_date=ct.get(
                        "start_date", "",
                    ),
                    notes=ct.get("notes", ""),
                )
            except ValueError:
                continue
            used = ct.get("used_offset", 0)
            if used:
                target.customers.update_contract(
                    name=c["name"],
                    contract_name=ct["name"],
                    updates={"used_offset": used},
                )
            if ct.get("end_date"):
                target.customers.close_contract(
                    name=c["name"],
                    contract_name=ct["name"],
                    end_date=ct["end_date"],
                )
        count += 1
    return count


def _clean_title(title: str) -> str:
    """Strip [CUSTOMER]: prefix and leading status
    keywords from a task title.

    Org backend includes the customer prefix in the
    title field. Re-imports can accumulate status
    keywords at the start. Both are stripped.
    """
    title = _CUSTOMER_PREFIX_RE.sub("", title).strip()
    # Strip accumulated status keywords from start
    changed = True
    while changed:
        changed = False
        for kw in _STATUS_KEYWORDS:
            if title.startswith(kw + " "):
                title = title[len(kw):].strip()
                changed = True
    return title


def _convert_tasks(
    source: Backend, target: Backend,
) -> int:
    """Copy tasks (open + done + archived)."""
    tasks = source.tasks.list_tasks(include_done=True)
    count = 0
    for t in tasks:
        target.tasks.add_task(
            customer=t.get("customer") or "",
            title=_clean_title(t["title"]),
            status=t.get("status", "TODO"),
            tags=t.get("tags"),
            body=t.get("body"),
            github_url=t.get("github_url"),
        )
        count += 1

    archived = source.tasks.list_archived()
    for a in archived:
        added = target.tasks.add_task(
            customer=a.get("customer") or "",
            title=_clean_title(a["title"]),
            status=a.get("archive_status", "DONE"),
            tags=a.get("tags"),
            body=a.get("body"),
            github_url=a.get("github_url"),
        )
        target.tasks.archive_task(added["id"])
        count += 1
    return count


def _convert_clocks(
    source: Backend, target: Backend,
) -> int:
    """Copy clock entries."""
    entries = source.clocks.list_entries(period="all")
    count = 0
    for e in entries:
        if e.get("end") is None:
            continue
        mins = e.get("duration_minutes") or 0
        if mins <= 0:
            continue
        h = int(mins // 60)
        m = int(mins % 60)
        dur_str = f"{h}h{m}m" if m else f"{h}h"
        tgt_date = None
        if e.get("start"):
            tgt_date = date.fromisoformat(
                e["start"][:10]
            )
        target.clocks.quick_book(
            duration_str=dur_str,
            customer=e["customer"],
            description=e.get("description", ""),
            task_id=e.get("task_id"),
            contract=e.get("contract"),
            target_date=tgt_date,
        )
        count += 1
    return count


def _clean_inbox_title(title: str, item_type: str) -> str:
    """Strip leading type word from inbox title if it
    matches the item's type (avoids duplication)."""
    parts = title.split(None, 1)
    if (len(parts) == 2
            and parts[0].lower() == (
                item_type or ""
            ).lower()):
        return parts[1]
    return title


def _convert_inbox(
    source: Backend, target: Backend,
) -> int:
    """Copy inbox items."""
    items = source.inbox.list_items()
    count = 0
    for item in items:
        title = _clean_inbox_title(
            _clean_title(item["title"]),
            item.get("type", ""),
        )
        target.inbox.add_item(
            text=title,
            item_type=item.get("type") or None,
            customer=item.get("customer") or None,
            body=item.get("body") or None,
            channel=item.get("channel") or None,
            direction=item.get("direction") or None,
        )
        count += 1
    return count


def _convert_notes(
    source: Backend, target: Backend,
) -> int:
    """Copy notes."""
    notes = source.notes.list_notes()
    count = 0
    for n in notes:
        target.notes.add_note(
            title=n["title"],
            body=n.get("body", ""),
            customer=n.get("customer"),
            tags=n.get("tags"),
            task_id=n.get("task_id"),
        )
        count += 1
    return count


def make_backend_from_spec(
    fmt: str,
    path: str,
) -> Backend:
    """Create a Backend from a format name and path/DSN.

    Supports: "markdown", "json", "sql", "org".
    For org/markdown/json, path is a directory.
    For sql, path is a DSN string.
    """
    if fmt == "sql":
        from ..backends.sql import make_sql_backend
        result = make_sql_backend(path)
        return Backend(
            tasks=result[0],
            clocks=result[1],
            inbox=result[2],
            customers=result[3],
            notes=result[4],
            watch_paths=result[5],
        )

    directory = Path(path)
    directory.mkdir(parents=True, exist_ok=True)

    if fmt == "markdown":
        from ..backends.markdown import (
            MarkdownClockBackend,
            MarkdownCustomerBackend,
            MarkdownInboxBackend,
            MarkdownNotesBackend,
            MarkdownTaskBackend,
        )
        return Backend(
            tasks=MarkdownTaskBackend(
                directory / "todos.md",
                directory / "archive.md",
            ),
            clocks=MarkdownClockBackend(
                directory / "clocks.md",
            ),
            inbox=MarkdownInboxBackend(
                directory / "inbox.md",
            ),
            customers=MarkdownCustomerBackend(
                directory / "customers.md",
                directory / "clocks.md",
            ),
            notes=MarkdownNotesBackend(
                directory / "notes.md",
            ),
            watch_paths=[],
        )

    if fmt == "json":
        from ..backends.json_backend import (
            JsonClockBackend,
            JsonCustomerBackend,
            JsonInboxBackend,
            JsonNotesBackend,
            JsonTaskBackend,
        )
        return Backend(
            tasks=JsonTaskBackend(
                directory / "tasks.json",
                directory / "archive.json",
            ),
            clocks=JsonClockBackend(
                directory / "clocks.json",
            ),
            inbox=JsonInboxBackend(
                directory / "inbox.json",
            ),
            customers=JsonCustomerBackend(
                directory / "customers.json",
                directory / "clocks.json",
            ),
            notes=JsonNotesBackend(
                directory / "notes.json",
            ),
            watch_paths=[],
        )

    if fmt == "org":
        from ..backends.org import make_org_backend
        from ..config import get_config
        cfg = get_config()

        class _OrgCfg:
            """Config overlay pointing to a custom dir.

            Delegates unknown attributes to the real
            config so make_org_backend can access
            WISSEN_DIR, RESEARCH_DIR, etc.
            """
            ORG_DIR = directory
            TODOS_FILE = directory / "todos.org"
            ARCHIVE_FILE = directory / "archive.org"
            CLOCKS_FILE = directory / "clocks.org"
            CUSTOMERS_FILE = directory / "customers.org"
            INBOX_FILE = directory / "inbox.org"
            NOTES_FILE = directory / "notes.org"
            SETTINGS_FILE = cfg.SETTINGS_FILE

            def __getattr__(self, name):
                return getattr(cfg, name)

        result = make_org_backend(_OrgCfg())
        return Backend(
            tasks=result[0],
            clocks=result[1],
            inbox=result[2],
            customers=result[3],
            notes=result[4],
            watch_paths=[],
        )

    raise ValueError(f"Unknown backend format: {fmt}")
