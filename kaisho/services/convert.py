"""Convert data between Kaisho backends.

Reads all entities from a source backend and writes them
to a target backend. Handles dependency ordering:
customers first, then tasks, clocks, inbox, notes.

Supports upsert: existing entries (matched by ID or
content) are skipped, new entries are created.
After import, discovered task states and tags are
auto-added to settings.
"""
import logging
import re
from pathlib import Path

from ..backends import Backend
from ..constants import TASK_STATUSES as _STATUS_KEYWORDS

log = logging.getLogger(__name__)

_CUSTOMER_PREFIX_RE = re.compile(r"^\[[^\]]+\]:\s*")
_INBOX_TYPE_RE = re.compile(r"^[A-Za-z][\w-]*$")

# Default colors for auto-discovered states
_STATE_COLORS = {
    "TODO": "#64748b",
    "NEXT": "#2563eb",
    "IN-PROGRESS": "#d97706",
    "WAIT": "#7c3aed",
    "DONE": "#16a34a",
    "CANCELLED": "#dc2626",
}
_DONE_STATES = {"DONE", "CANCELLED"}


# -- Skip tracking ---------------------------------------------------
#
# convert is a one-shot CLI: a single failing row must not abort the
# whole migration, but the user must also be told *exactly* what was
# dropped (previously these failures were swallowed silently and only
# surfaced as missing data weeks later). The pattern below collects
# every skip into per-entity lists, logs each one at WARNING with the
# failing identifier + exception class + message, and prints a
# one-line summary per entity at the end of the run.
#
# Catching ``Exception`` (rather than just ``ValueError``) is a
# deliberate widening: SQL backends raise ``IntegrityError``,
# ``AttributeError`` etc. that the original ``except ValueError``
# silently re-raised back into the loop, killing the whole import on
# the first bad row. Broad catch + verbose log is the right trade-off
# for an interactive one-shot tool.


def _try_or_skip(
    skipped: list[str],
    label: str,
    identifier: str,
    fn,
    treat_exists_as_success: bool = False,
) -> bool:
    """Run *fn*; on any exception log and record a skip.

    :param skipped: List to append the *identifier* to on
        failure. The caller surfaces this list in the summary
        line.
    :param label: Entity kind ("customer", "contract", ...),
        used in the log line only.
    :param identifier: Human-readable identifier for the row
        (customer name, task title, ...). Recorded in
        *skipped* and the log line.
    :param fn: Zero-arg callable that performs the actual
        write. Its return value is ignored.
    :param treat_exists_as_success: When True, a ``ValueError``
        whose message contains "already exists" returns True
        without logging a skip. Used by add-paths that are
        meant to be idempotent across re-runs: the customer
        or contract is already in the target, so subsequent
        update/close steps should still proceed.
    :returns: True on success, False on failure.
    """
    try:
        fn()
        return True
    except ValueError as exc:
        # Idempotent no-op: target already has this row, so
        # the caller's downstream update/close still applies.
        if (
            treat_exists_as_success
            and "already exists" in str(exc)
        ):
            return True
        skipped.append(identifier)
        log.warning(
            "convert: skipped %s %r: %s: %s",
            label,
            identifier,
            type(exc).__name__,
            exc,
        )
        return False
    except Exception as exc:  # noqa: BLE001 (see module docstring)
        log.warning(
            "convert: skipped %s %r: %s: %s",
            label,
            identifier,
            type(exc).__name__,
            exc,
        )
        skipped.append(identifier)
        return False


def _summarise_skips(label: str, skipped: list[str]) -> None:
    """Emit a one-line summary if any items were skipped.

    Prints to stdout (the convert CLI's user-facing channel) and
    also logs at WARNING so file-based logging captures it.
    """
    if not skipped:
        return
    msg = (
        f"{len(skipped)} {label}(s) skipped: "
        f"{', '.join(skipped)} -- re-run with KAISHO_LOG=DEBUG "
        f"for the underlying exceptions."
    )
    print(msg)
    log.warning("convert: %s", msg)


def convert_backend(
    source: Backend,
    target: Backend,
    settings_file: Path | None = None,
) -> dict[str, int]:
    """Convert all data from source to target.

    Returns a summary dict mapping entity names to the
    number of records converted.

    When ``settings_file`` is provided, auto-populates
    task_states and tags from discovered data.

    >>> convert_backend(empty_src, empty_tgt)
    {'customers': 0, 'tasks': 0, 'clocks': 0, \
'inbox': 0, 'notes': 0}
    """
    summary: dict[str, int] = {}

    customer_skips: list[str] = []
    contract_skips: list[str] = []
    summary["customers"] = _convert_customers(
        source, target,
        skipped_customers=customer_skips,
        skipped_contracts=contract_skips,
    )

    task_skips: list[str] = []
    tasks_result = _convert_tasks(
        source, target, skipped=task_skips,
    )
    summary["tasks"] = tasks_result["count"]

    clock_skips: list[str] = []
    summary["clocks"] = _convert_clocks(
        source, target, skipped=clock_skips,
    )

    inbox_skips: list[str] = []
    summary["inbox"] = _convert_inbox(
        source, target, skipped=inbox_skips,
    )

    note_skips: list[str] = []
    summary["notes"] = _convert_notes(
        source, target, skipped=note_skips,
    )

    _summarise_skips("customer", customer_skips)
    _summarise_skips("contract", contract_skips)
    _summarise_skips("task", task_skips)
    _summarise_skips("clock", clock_skips)
    _summarise_skips("inbox item", inbox_skips)
    _summarise_skips("note", note_skips)

    if settings_file:
        _auto_populate_settings(
            settings_file,
            tasks_result["states"],
            tasks_result["tags"],
        )

    return summary


def _auto_populate_settings(
    settings_file: Path,
    discovered_states: set[str],
    discovered_tags: set[str],
) -> None:
    """Add missing task states and tags to settings."""
    from .settings import load_settings, save_settings

    data = load_settings(settings_file)
    existing_states = {
        s["name"] for s in data.get("task_states", [])
    }
    existing_tags = {
        t["name"] for t in data.get("tags", [])
    }

    states_list = list(data.get("task_states", []))
    for state in sorted(discovered_states):
        if state not in existing_states:
            states_list.append({
                "name": state,
                "label": state.replace("-", " ").title(),
                "color": _STATE_COLORS.get(
                    state, "#64748b",
                ),
                "done": state in _DONE_STATES,
            })

    tags_list = list(data.get("tags", []))
    for tag in sorted(discovered_tags):
        if tag not in existing_tags:
            tags_list.append({
                "name": tag,
                "color": "",
                "description": "",
            })

    added_states = len(states_list) > len(
        existing_states
    )
    added_tags = len(tags_list) > len(existing_tags)
    if added_states or added_tags:
        data["task_states"] = states_list
        data["tags"] = tags_list
        save_settings(settings_file, data)


def _convert_customers(
    source: Backend,
    target: Backend,
    skipped_customers: list[str],
    skipped_contracts: list[str],
) -> int:
    """Copy customers and their contracts.

    Skips customers that already exist in target. Any
    exception from the target backend (validation,
    constraint violation, ...) is logged and the customer
    is recorded as skipped; contracts under a skipped
    customer are not attempted.
    """
    customers = source.customers.list_customers(
        include_inactive=True,
    )
    count = 0
    for c in customers:
        ok = _try_or_skip(
            skipped_customers,
            "customer",
            c["name"],
            lambda c=c: target.customers.add_customer(
                name=c["name"],
                status=c.get("status", "active"),
                customer_type=c.get("type", ""),
                budget=c.get("budget", 0),
                color=c.get("color", ""),
                repo=c.get("repo"),
                tags=c.get("tags"),
            ),
            treat_exists_as_success=True,
        )
        if not ok:
            continue
        for ct in c.get("contracts", []):
            _convert_contract(
                target, c["name"], ct, skipped_contracts,
            )
        count += 1
    return count


def _convert_contract(
    target: Backend,
    customer_name: str,
    ct: dict,
    skipped: list[str],
) -> None:
    """Copy one contract plus its used-offset / close state.

    Each step is logged on failure; later steps are skipped
    when an earlier one fails (you can't update_contract on
    a contract that wasn't created).
    """
    identifier = f"{customer_name}/{ct['name']}"
    created = _try_or_skip(
        skipped,
        "contract",
        identifier,
        lambda: target.customers.add_contract(
            name=customer_name,
            contract_name=ct["name"],
            budget=ct.get("budget", 0),
            start_date=ct.get("start_date", ""),
            notes=ct.get("notes", ""),
            billable=ct.get("billable", True),
            invoiced=ct.get("invoiced", False),
        ),
        treat_exists_as_success=True,
    )
    if not created:
        return
    used = ct.get("used_offset", 0)
    if used:
        _try_or_skip(
            skipped,
            "contract used_offset",
            identifier,
            lambda: target.customers.update_contract(
                name=customer_name,
                contract_name=ct["name"],
                updates={"used_offset": used},
            ),
        )
    if ct.get("end_date"):
        _try_or_skip(
            skipped,
            "contract close",
            identifier,
            lambda: target.customers.close_contract(
                name=customer_name,
                contract_name=ct["name"],
                end_date=ct["end_date"],
            ),
        )


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
    source: Backend,
    target: Backend,
    skipped: list[str],
) -> dict:
    """Copy tasks with upsert by task ID.

    Returns dict with count, discovered states, and
    discovered tags.
    """
    tasks = source.tasks.list_tasks(include_done=True)
    existing = target.tasks.list_tasks(
        include_done=True,
    )
    existing_ids = {t["id"] for t in existing}
    discovered_states: set[str] = set()
    discovered_tags: set[str] = set()
    count = 0

    for t in tasks:
        status = t.get("status", "TODO")
        discovered_states.add(status)
        for tag in t.get("tags") or []:
            discovered_tags.add(tag)
        if t.get("id") in existing_ids:
            continue
        ok = _try_or_skip(
            skipped,
            "task",
            t.get("title", "<no title>"),
            lambda t=t, status=status: target.tasks.add_task(
                customer=t.get("customer") or "",
                title=_clean_title(t["title"]),
                status=status,
                tags=t.get("tags"),
                body=t.get("body"),
                github_url=t.get("github_url"),
            ),
        )
        if ok:
            count += 1

    archived = source.tasks.list_archived()
    archived_ids = {
        a["id"] for a in target.tasks.list_archived()
    }
    for a in archived:
        status = a.get("archive_status", "DONE")
        discovered_states.add(status)
        for tag in a.get("tags") or []:
            discovered_tags.add(tag)
        if a.get("id") in archived_ids:
            continue
        if _archive_one_task(target, a, status, skipped):
            count += 1

    return {
        "count": count,
        "states": discovered_states,
        "tags": discovered_tags,
    }


def _archive_one_task(
    target: Backend,
    a: dict,
    status: str,
    skipped: list[str],
) -> bool:
    """Add and archive a single task. Returns True on success."""
    holder: dict = {}

    def _add():
        holder["row"] = target.tasks.add_task(
            customer=a.get("customer") or "",
            title=_clean_title(a["title"]),
            status=status,
            tags=a.get("tags"),
            body=a.get("body"),
            github_url=a.get("github_url"),
        )

    title = a.get("title", "<no title>")
    if not _try_or_skip(skipped, "archived task", title, _add):
        return False
    return _try_or_skip(
        skipped,
        "archive task",
        title,
        lambda: target.tasks.archive_task(holder["row"]["id"]),
    )


def _clock_fingerprint(entry: dict) -> str:
    """Create a dedup key from clock entry content."""
    start = (entry.get("start") or "")[:16]
    customer = entry.get("customer", "")
    desc = entry.get("description", "")
    return f"{start}|{customer}|{desc}"


def _convert_clocks(
    source: Backend,
    target: Backend,
    skipped: list[str],
) -> int:
    """Copy clock entries, skipping duplicates.

    Preserves original start/end times. Matches by
    start timestamp + customer + description.
    """
    entries = source.clocks.list_entries(period="all")
    existing = target.clocks.list_entries(period="all")
    existing_fps = {
        _clock_fingerprint(e) for e in existing
    }
    count = 0
    for e in entries:
        if e.get("end") is None:
            continue
        mins = e.get("duration_minutes") or 0
        if mins <= 0:
            continue
        if _clock_fingerprint(e) in existing_fps:
            continue
        h = int(mins // 60)
        m = int(mins % 60)
        dur_str = f"{h}h{m}m" if m else f"{h}h"
        ok = _try_or_skip(
            skipped,
            "clock",
            _clock_fingerprint(e),
            lambda e=e, dur_str=dur_str: (
                target.clocks.quick_book(
                    duration_str=dur_str,
                    customer=e["customer"],
                    description=e.get("description", ""),
                    task_id=e.get("task_id"),
                    contract=e.get("contract"),
                    start_time=e.get("start"),
                )
            ),
        )
        if ok:
            count += 1
    return count


def _clean_inbox_title(
    title: str, item_type: str,
) -> str:
    """Strip leading type word from inbox title if it
    matches the item's type (avoids duplication)."""
    parts = title.split(None, 1)
    if (len(parts) == 2
            and parts[0].lower() == (
                item_type or ""
            ).lower()):
        return parts[1]
    return title


def _inbox_fingerprint(item: dict) -> str:
    """Create a dedup key from inbox item content."""
    title = item.get("title", "")
    body = (item.get("body") or "")[:100]
    return f"{title}|{body}"


def _convert_inbox(
    source: Backend,
    target: Backend,
    skipped: list[str],
) -> int:
    """Copy inbox items, skipping duplicates."""
    items = source.inbox.list_items()
    existing = target.inbox.list_items()
    existing_fps = {
        _inbox_fingerprint(e) for e in existing
    }
    count = 0
    for item in items:
        title = _clean_inbox_title(
            _clean_title(item["title"]),
            item.get("type", ""),
        )
        fp = _inbox_fingerprint({
            "title": title,
            "body": item.get("body"),
        })
        if fp in existing_fps:
            continue
        ok = _try_or_skip(
            skipped,
            "inbox item",
            title,
            lambda item=item, title=title: target.inbox.add_item(
                text=title,
                item_type=item.get("type") or None,
                customer=item.get("customer") or None,
                body=item.get("body") or None,
                channel=item.get("channel") or None,
                direction=item.get("direction") or None,
            ),
        )
        if ok:
            count += 1
    return count


def _note_fingerprint(note: dict) -> str:
    """Create a dedup key from note content."""
    title = note.get("title", "")
    body = (note.get("body") or "")[:100]
    return f"{title}|{body}"


def _convert_notes(
    source: Backend,
    target: Backend,
    skipped: list[str],
) -> int:
    """Copy notes, skipping duplicates."""
    notes = source.notes.list_notes()
    existing = target.notes.list_notes()
    existing_fps = {
        _note_fingerprint(n) for n in existing
    }
    count = 0
    for n in notes:
        fp = _note_fingerprint(n)
        if fp in existing_fps:
            continue
        ok = _try_or_skip(
            skipped,
            "note",
            n.get("title", "<no title>"),
            lambda n=n: target.notes.add_note(
                title=n["title"],
                body=n.get("body", ""),
                customer=n.get("customer"),
                tags=n.get("tags"),
                task_id=n.get("task_id"),
            ),
        )
        if ok:
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
            KNOWLEDGE_DIR, RESEARCH_DIR, etc.
            """
            ORG_DIR = directory
            TODOS_FILE = directory / "todos.org"
            ARCHIVE_FILE = directory / "archive.org"
            CLOCKS_FILE = directory / "clocks.org"
            CUSTOMERS_FILE = (
                directory / "customers.org"
            )
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

    raise ValueError(
        f"Unknown backend format: {fmt}"
    )
